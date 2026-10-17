// api/gemini.ts
// Fluxo: calendário (NHL) + últimos 7 JOGOS de cada equipa (NHL) → modelo estatístico (Poisson) → probabilidades.
// A IA (Groq) só escreve o resumo de cada jogo; os números vêm do modelo, não da IA.
//
// Forma recente: cada equipa é avaliada pelos seus últimos 7 jogos terminados (ou pelos que tiver: com 3 jogos, são esses 3).
// - Até ao 7.º dia da época regular, jogos de pré-época entram para completar os 7.
// - A partir do 8.º dia da época regular, a pré-época deixa de contar (a equipa fica só com os jogos da época regular).

import { redis } from "./_redis.js";

export const config = { runtime: "edge" };

const NHL_API = "https://api-web.nhle.com/v1";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const TEAM_GAMES = 7; // jogos recentes usados por equipa
const LOOKBACK_DAYS = 21; // até onde se procuram esses jogos
const PRESEASON_CUTOFF_DAY = 8; // a partir deste dia da época regular a pré-época deixa de contar
const CACHE_PREFIX = "nhl:analysis:v8:";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas (as lesões influenciam os números)
const GAME_CACHE_PREFIX = "nhl:game:v2:"; // golos do 1.º período de jogos já terminados (nunca mudam)
const GAME_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ESPN_INJURIES_URL = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries";
const INJURY_CACHE_KEY = "nhl:injuries:v2";
const INJURY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos
const MAX_INJURIES_PER_TEAM = 8; // máximo mostrado no ecrã
const STATS_REST = "https://api.nhle.com/stats/rest/en";
const PLAYERS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ROSTER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_PBP_FETCHES = 80;
const PBP_BATCH = 10;

// Parâmetros do modelo estatístico (ajustáveis).
const MODEL_CFG = {
  evenBand: 1, // jogo "equilibrado" se a vitória da casa arredondada estiver entre 49% e 51%
  priorGamesP2: 30, // idem para o 2.º período
  p2Share: 0.34, // fração dos golos que cai no 2.º período (referência; a janela corrige)
  priorGamesP1: 30, // idem para os golos do 1.º período (mais ruidosos, mas com padrão próprio de cada equipa)
  priorGames: 40, // peso (em jogos) da média da liga na força de ataque/defesa (a diferença real entre equipas é pequena face ao ruído de poucos jogos)
  leagueGoalsPerGame: 6.1, // golos totais por jogo em tempo regulamentar (referência da liga)
  leaguePriorGames: 30, // peso dessa referência quando se calculam as médias da janela
  rateBlendGames: 40, // peso da referência ao calibrar as taxas da liga (empate, 1.º período, totais)
  homeEdge: 0.05, // vantagem de casa: +5% golos esperados em casa, -5% fora
  regTieRate: 0.22, // empates ao fim dos 60 min (NHL 2016-17 a 2024-25: entre 20,5% e 23,5%)
  p1Share: 0.31, // fração dos golos que cai no 1.º período
  extraTimeHomeShare: 0.5, // quem vence o prolongamento/desempate: 50/50
  // Cansaço (2.ª noite seguida): a equipa cansada marca menos e sofre mais. Efeito ~ -4 pontos na vitória
  // (equipas cansadas contra descansadas ficam à volta de 45% dos pontos disputados).
  backToBack: { ownGoals: -0.06, oppGoals: 0.035 },
} as const;

// ─── Tipos ───────────────────────────────────────────────────────────────────

type NhlGame = {
  id: number;
  startTimeUTC: string;
  gameType: number; // 1 = pré-época, 2 = época regular, 3 = playoffs
  homeAbbr: string;
  awayAbbr: string;
  homeName: string;
  awayName: string;
};

type FinishedGame = {
  id: number;
  date: string;
  gameType: number;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  ending: "REG" | "OT" | "SO" | "UNKNOWN";
  p1Home: number | null;
  p1Away: number | null;
  p2Home: number | null;
  p2Away: number | null;
};

type TeamRecent = {
  abbr: string;
  gp: number;
  preGp: number;
  w: number;
  l: number;
  otl: number;
  gf: number;
  ga: number;
  regGf: number; // golos marcados em tempo regulamentar
  regGa: number;
  over45: number;
  over55: number;
  regTies: number;
  p1n: number;
  p1Over15: number;
  p1Btts: number;
  p1For: number;
  p1Against: number;
  p1Scored: number; // jogos em que a equipa marcou no 1.º período
  p1Conceded: number; // jogos em que sofreu golo no 1.º período
  p2n: number; // idem para o 2.º período
  p2For: number;
  p2Against: number;
  p2Scored: number;
  p2Conceded: number;
  p2Over15: number;
  p2Btts: number;
};

type LeagueRates = {
  games: number;
  p1Games: number;
  regGoalsSum: number;
  p1GoalsSum: number; // golos no 1.º período (jogos com dados)
  p1RegGoalsSum: number; // golos em tempo regulamentar desses mesmos jogos
  ties: number;
  p1Over15: number;
  p1Btts: number;
  p2Games: number;
  p2GoalsSum: number;
  p2RegGoalsSum: number;
  p2Over15: number;
  p2Btts: number;
  over45: number;
  over55: number;
};

type TeamP1Stats = {
  n: number; // jogos com dados do 1.º período
  scored: number; // jogos em que marcou no 1.º período
  conceded: number; // jogos em que sofreu golo no 1.º período
  over15: number; // jogos com 2+ golos no 1.º período (somando as duas equipas)
  btts: number; // jogos em que ambas marcaram no 1.º período
  scoreProb: number; // % (modelo) de marcar no 1.º período hoje
};

type Prediction = {
  id: string;
  homeTeam: string;
  homeTeamAbbr: string;
  homeRecordL10: string; // registo V-D-DP dos últimos 7 jogos
  awayTeam: string;
  awayTeamAbbr: string;
  awayRecordL10: string;
  dateTime: string;
  winProbabilityHome: number;
  winProbabilityAway: number;
  over15P1Prob: number;
  bttsP1Prob: number;
  drawTRProb: number;
  over45Prob: number;
  over55Prob: number;
  analysisSummary: string;
  injuries: { home: string[]; away: string[] };
  // Extras para o ecrã
  expGoalsHome: number; // golos esperados de cada equipa neste jogo
  expGoalsAway: number;
  homeGames: number; // jogos em que a estimativa de cada equipa se baseia
  awayGames: number;
  homeB2B: boolean; // jogou ontem
  awayB2B: boolean;
  favorite: "home" | "away" | "even"; // "even" = jogo equilibrado, sem favorito
  scoreGuess: string; // ex.: "3–2"
  totalLine: number; // ex.: 6.5
  p1WinHome: number; // % de estar a ganhar no fim do 1.º período
  p1Draw: number;
  p1WinAway: number;
  over15P2Prob: number; // 2+ golos no 2.º período
  homeP1: TeamP1Stats;
  awayP1: TeamP1Stats;
  homeP2: TeamP1Stats;
  awayP2: TeamP1Stats;
  injuryAdj: { home: number; away: number }; // golos/jogo que cada equipa perde por lesões
};

type AnalysisPayload = {
  predictions: Prediction[];
  lastUpdated: string;
  meta: {
    source: "model";
    games: number;
    window?: { from: string; to: string; gamesUsed: number; preseasonGames: number; regularSeasonDay: number; gamesPerTeam: number };
    backToBack?: string[];
    injuries?: { source: "espn" | "unavailable"; teams: number };
    injuryImpact?: { source: "ok" | "unavailable"; teamsAffected: number };
    note?: string;
  };
};

// ─── Utilitários ─────────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

const num = (x: unknown, fallback = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
};

const etDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function addDays(d: string, days: number) {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ─── Calendário do dia analisado ─────────────────────────────────────────────

async function fetchGames(date: string): Promise<NhlGame[]> {
  const res = await fetchWithTimeout(`${NHL_API}/schedule/${date}`);
  if (!res.ok) throw new Error(`Calendário da NHL indisponível (HTTP ${res.status}).`);
  const data = await res.json();

  const seen = new Set<number>();
  const games: NhlGame[] = [];

  for (const day of Array.isArray(data?.gameWeek) ? data.gameWeek : []) {
    for (const g of Array.isArray(day?.games) ? day.games : []) {
      if (!g?.id || !g?.startTimeUTC || seen.has(g.id)) continue;
      // Mesmo critério do /api/results: o "dia do jogo" é a data na hora da costa leste.
      if (etDate(g.startTimeUTC) !== date) continue;
      seen.add(g.id);

      const fullName = (t: any) =>
        [t?.placeName?.default, t?.commonName?.default].filter(Boolean).join(" ") || t?.abbrev || "";

      games.push({
        id: g.id,
        startTimeUTC: g.startTimeUTC,
        gameType: num(g.gameType, 2),
        homeAbbr: String(g.homeTeam?.abbrev ?? "").toUpperCase(),
        awayAbbr: String(g.awayTeam?.abbrev ?? "").toUpperCase(),
        homeName: fullName(g.homeTeam),
        awayName: fullName(g.awayTeam),
      });
    }
  }

  return games.sort((a, b) => a.startTimeUTC.localeCompare(b.startTimeUTC));
}

// ─── Forma recente (últimos 7 jogos de cada equipa) ──────────────────────────

async function fetchFinishedGames(date: string): Promise<{ games: FinishedGame[]; failedDays: number }> {
  const days = Array.from({ length: LOOKBACK_DAYS }, (_, i) => addDays(date, -(i + 1)));
  let failedDays = 0;

  const perDay = await Promise.all(
    days.map(async (d) => {
      try {
        const res = await fetchWithTimeout(`${NHL_API}/score/${d}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { d, data: await res.json() };
      } catch (e) {
        failedDays++;
        console.error(`[gemini] score ${d} falhou:`, e);
        return { d, data: null };
      }
    })
  );

  const seen = new Set<number>();
  const games: FinishedGame[] = [];

  for (const { d, data } of perDay) {
    for (const g of Array.isArray(data?.games) ? data.games : []) {
      const state = String(g?.gameState ?? "").toUpperCase();
      if (state !== "OFF" && state !== "FINAL") continue;
      const gameType = num(g?.gameType, 0);
      if (gameType < 1 || gameType > 3) continue; // pré-época, época regular, playoffs
      if (!g?.id || seen.has(g.id)) continue;
      seen.add(g.id);

      const pt = String(g?.periodDescriptor?.periodType ?? "").toUpperCase();
      const lastPeriod = num(g?.period ?? g?.periodDescriptor?.number, 0);
      const ending: FinishedGame["ending"] =
        pt === "SO" ? "SO" : pt === "OT" ? "OT" : pt === "REG" ? "REG" : lastPeriod > 3 ? "OT" : lastPeriod === 3 ? "REG" : "UNKNOWN";

      games.push({
        id: g.id,
        date: d,
        gameType,
        homeAbbr: String(g.homeTeam?.abbrev ?? "").toUpperCase(),
        awayAbbr: String(g.awayTeam?.abbrev ?? "").toUpperCase(),
        homeScore: num(g.homeTeam?.score),
        awayScore: num(g.awayTeam?.score),
        ending,
        p1Home: null,
        p1Away: null,
        p2Home: null,
        p2Away: null,
      });
    }
  }

  return { games, failedDays };
}

async function fetchPeriodGoals(gameId: number): Promise<{ h: number; a: number; h2: number; a2: number } | null> {
  try {
    const res = await fetchWithTimeout(`${NHL_API}/gamecenter/${gameId}/play-by-play`, {}, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    const homeId = data?.homeTeam?.id;
    const awayId = data?.awayTeam?.id;
    if (homeId == null || awayId == null) return null;

    let h = 0;
    let a = 0;
    let h2 = 0;
    let a2 = 0;
    for (const p of Array.isArray(data?.plays) ? data.plays : []) {
      if (p?.typeDescKey !== "goal") continue;
      const period = p?.periodDescriptor?.number;
      const owner = p?.details?.eventOwnerTeamId;
      if (period === 1) {
        if (owner === homeId) h++;
        else if (owner === awayId) a++;
      } else if (period === 2) {
        if (owner === homeId) h2++;
        else if (owner === awayId) a2++;
      }
    }
    return { h, a, h2, a2 };
  } catch {
    return null;
  }
}

/** Preenche os golos do 1.º e do 2.º período. Jogos terminados não mudam, por isso ficam em cache no Redis. */
async function enrichFirstPeriod(games: FinishedGame[]) {
  const cached = await Promise.all(games.map((g) => redis.get(`${GAME_CACHE_PREFIX}${g.id}`)));
  const missing: FinishedGame[] = [];

  games.forEach((g, i) => {
    const raw = cached[i];
    if (raw) {
      try {
        const v = JSON.parse(raw);
        if (Number.isFinite(v?.h) && Number.isFinite(v?.a) && Number.isFinite(v?.h2) && Number.isFinite(v?.a2)) {
          g.p1Home = v.h;
          g.p1Away = v.a;
          g.p2Home = v.h2;
          g.p2Away = v.a2;
          return;
        }
      } catch {
        /* cai para "em falta" */
      }
    }
    missing.push(g);
  });

  const toFetch = missing.slice(0, MAX_PBP_FETCHES);
  for (let i = 0; i < toFetch.length; i += PBP_BATCH) {
    const batch = toFetch.slice(i, i + PBP_BATCH);
    const results = await Promise.all(batch.map((g) => fetchPeriodGoals(g.id)));
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (!r) continue;
      batch[j].p1Home = r.h;
      batch[j].p1Away = r.a;
      batch[j].p2Home = r.h2;
      batch[j].p2Away = r.a2;
      await redis.setPx(`${GAME_CACHE_PREFIX}${batch[j].id}`, JSON.stringify(r), GAME_CACHE_TTL_MS);
    }
  }
}

/** Golos em tempo regulamentar: no prolongamento/desempate o golo decisivo conta fora dos 60 min. */
const regTotal = (g: FinishedGame) =>
  g.homeScore + g.awayScore - (g.ending === "OT" || g.ending === "SO" ? 1 : 0);

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);

/** Escolhe, para cada equipa, os seus últimos TEAM_GAMES jogos terminados (aplicando a regra da pré-época). */
function selectRecentGames(all: FinishedGame[], date: string, teams: string[]) {
  const regularDates = all.filter((g) => g.gameType >= 2).map((g) => g.date).sort();
  const regularSeasonDay = regularDates.length ? daysBetween(regularDates[0], date) + 1 : 0;
  const usePreseason = regularSeasonDay < PRESEASON_CUTOFF_DAY; // inclui "ainda sem época regular" (dia 0)

  const pool = usePreseason ? all : all.filter((g) => g.gameType !== 1);
  const sorted = [...pool].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const perTeam = new Map<string, FinishedGame[]>();
  const used = new Map<number, FinishedGame>();
  for (const abbr of new Set(teams)) {
    const mine = sorted.filter((g) => g.homeAbbr === abbr || g.awayAbbr === abbr).slice(0, TEAM_GAMES);
    perTeam.set(abbr, mine);
    for (const g of mine) used.set(g.id, g);
  }
  return { perTeam, used: [...used.values()], regularSeasonDay };
}

function aggregateTeams(perTeam: Map<string, FinishedGame[]>): Map<string, TeamRecent> {
  const map = new Map<string, TeamRecent>();

  for (const [abbr, games] of perTeam) {
    const t: TeamRecent = { abbr, gp: 0, preGp: 0, w: 0, l: 0, otl: 0, gf: 0, ga: 0, regGf: 0, regGa: 0, over45: 0, over55: 0, regTies: 0, p1n: 0, p1Over15: 0, p1Btts: 0, p1For: 0, p1Against: 0, p1Scored: 0, p1Conceded: 0, p2n: 0, p2For: 0, p2Against: 0, p2Scored: 0, p2Conceded: 0, p2Over15: 0, p2Btts: 0 };

    for (const g of games) {
      const side = g.homeAbbr === abbr ? "home" : "away";
      const own = side === "home" ? g.homeScore : g.awayScore;
      const opp = side === "home" ? g.awayScore : g.homeScore;
      const total = regTotal(g);
      const wentExtra = g.ending === "OT" || g.ending === "SO";

      t.gp++;
      if (g.gameType === 1) t.preGp++;
      t.gf += own;
      t.ga += opp;
      // Em tempo regulamentar: se foi a prolongamento/desempate, o jogo estava empatado aos 60 min.
      t.regGf += wentExtra ? Math.min(own, opp) : own;
      t.regGa += wentExtra ? Math.min(own, opp) : opp;
      if (own > opp) t.w++;
      else if (wentExtra) t.otl++;
      else t.l++;

      if (total >= 5) t.over45++;
      if (total >= 6) t.over55++;
      if (wentExtra) t.regTies++;

      if (g.p1Home != null && g.p1Away != null) {
        t.p1n++;
        if (g.p1Home + g.p1Away >= 2) t.p1Over15++;
        if (g.p1Home > 0 && g.p1Away > 0) t.p1Btts++;
        const ownP1 = side === "home" ? g.p1Home : g.p1Away;
        const oppP1 = side === "home" ? g.p1Away : g.p1Home;
        t.p1For += ownP1;
        t.p1Against += oppP1;
        if (ownP1 > 0) t.p1Scored++;
        if (oppP1 > 0) t.p1Conceded++;
      }

      if (g.p2Home != null && g.p2Away != null) {
        t.p2n++;
        if (g.p2Home + g.p2Away >= 2) t.p2Over15++;
        if (g.p2Home > 0 && g.p2Away > 0) t.p2Btts++;
        const ownP2 = side === "home" ? g.p2Home : g.p2Away;
        const oppP2 = side === "home" ? g.p2Away : g.p2Home;
        t.p2For += ownP2;
        t.p2Against += oppP2;
        if (ownP2 > 0) t.p2Scored++;
        if (oppP2 > 0) t.p2Conceded++;
      }
    }
    map.set(abbr, t);
  }
  return map;
}

function leagueRates(games: FinishedGame[]): LeagueRates {
  const p1 = games.filter((g) => g.p1Home != null && g.p1Away != null);
  const p2 = games.filter((g) => g.p2Home != null && g.p2Away != null);
  return {
    games: games.length,
    p1Games: p1.length,
    regGoalsSum: games.reduce((sum, g) => sum + regTotal(g), 0),
    p1GoalsSum: p1.reduce((sum, g) => sum + g.p1Home! + g.p1Away!, 0),
    p1RegGoalsSum: p1.reduce((sum, g) => sum + regTotal(g), 0),
    ties: games.filter((g) => g.ending === "OT" || g.ending === "SO").length,
    p1Over15: p1.filter((g) => g.p1Home! + g.p1Away! >= 2).length,
    p1Btts: p1.filter((g) => g.p1Home! > 0 && g.p1Away! > 0).length,
    p2Games: p2.length,
    p2GoalsSum: p2.reduce((sum, g) => sum + g.p2Home! + g.p2Away!, 0),
    p2RegGoalsSum: p2.reduce((sum, g) => sum + regTotal(g), 0),
    p2Over15: p2.filter((g) => g.p2Home! + g.p2Away! >= 2).length,
    p2Btts: p2.filter((g) => g.p2Home! > 0 && g.p2Away! > 0).length,
    over45: games.filter((g) => regTotal(g) >= 5).length,
    over55: games.filter((g) => regTotal(g) >= 6).length,
  };
}

// ─── Modelo estatístico (Poisson) ────────────────────────────────────────────
// 1. Golos esperados de cada equipa = média da liga × ataque próprio × defesa do adversário × vantagem de casa.
//    Ataque/defesa vêm dos últimos 7 jogos de cada equipa, "puxados" para a média da liga (poucos jogos = pouca confiança).
// 2. Com esses golos esperados calculam-se vitória, empate nos 60 min, 1.º período e totais de golos.
// 3. Cada mercado é calibrado para que um jogo "médio" dê a taxa real da liga (sobretudo o empate,
//    que o Poisson puro subestima: ~17% contra ~22% reais).

const poissonPmf = (l: number, max: number) => {
  const p = [Math.exp(-l)];
  for (let k = 1; k <= max; k++) p.push((p[k - 1] * l) / k);
  return p;
};
/** P(X >= n) para X ~ Poisson(l) */
const poissonAtLeast = (l: number, n: number) =>
  Math.max(0, 1 - poissonPmf(l, n - 1).reduce((a, b) => a + b, 0));

type RawMarkets = { hw: number; aw: number; tie: number; over15P1: number; btts: number; over15P2: number; btts2: number; over45: number; over55: number };

/** lh/la: golos esperados no jogo (60 min); lh1/la1 e lh2/la2: golos esperados no 1.º e no 2.º período. */
function rawMarkets(lh: number, la: number, lh1: number, la1: number, lh2: number, la2: number): RawMarkets {
  const ph = poissonPmf(lh, 20);
  const pa = poissonPmf(la, 20);
  let hw = 0;
  let aw = 0;
  let tie = 0;
  for (let i = 0; i <= 20; i++) {
    for (let j = 0; j <= 20; j++) {
      const p = ph[i] * pa[j];
      if (i > j) hw += p;
      else if (i < j) aw += p;
      else tie += p;
    }
  }
  const s = lh1 + la1;
  const s2 = lh2 + la2;
  return {
    hw,
    aw,
    tie,
    over15P1: 1 - Math.exp(-s) * (1 + s),
    btts: (1 - Math.exp(-lh1)) * (1 - Math.exp(-la1)),
    over15P2: 1 - Math.exp(-s2) * (1 + s2),
    btts2: (1 - Math.exp(-lh2)) * (1 - Math.exp(-la2)),
    over45: poissonAtLeast(lh + la, 5),
    over55: poissonAtLeast(lh + la, 6),
  };
}

type LeagueCtx = {
  mu: number; // golos esperados por equipa num jogo médio
  mu1: number; // idem, só no 1.º período
  mu2: number; // idem, só no 2.º período
  factors: { tie: number; over15P1: number; btts: number; over15P2: number; btts2: number; over45: number; over55: number };
};

function buildLeagueCtx(lg: LeagueRates): LeagueCtx {
  const C = MODEL_CFG;
  const totalGoals = (lg.regGoalsSum + C.leagueGoalsPerGame * C.leaguePriorGames) / (lg.games + C.leaguePriorGames);
  const mu = totalGoals / 2;
  const share =
    (lg.p1GoalsSum + C.p1Share * C.leagueGoalsPerGame * C.leaguePriorGames) /
    (lg.p1RegGoalsSum + C.leagueGoalsPerGame * C.leaguePriorGames);
  const mu1 = mu * share;
  const share2 =
    (lg.p2GoalsSum + C.p2Share * C.leagueGoalsPerGame * C.leaguePriorGames) /
    (lg.p2RegGoalsSum + C.leagueGoalsPerGame * C.leaguePriorGames);
  const mu2 = mu * share2;

  const e = C.homeEdge;
  const base = rawMarkets(mu * (1 + e), mu * (1 - e), mu1 * (1 + e), mu1 * (1 - e), mu2 * (1 + e), mu2 * (1 - e));
  const rate = (count: number, n: number) => (n > 0 ? count / n : 0);
  const blend = (count: number, n: number, prior: number) =>
    (rate(count, n) * n + prior * C.rateBlendGames) / (n + C.rateBlendGames);
  const ratio = (target: number, model: number) => (model > 0 ? target / model : 1);

  return {
    mu,
    mu1,
    mu2,
    factors: {
      tie: ratio(blend(lg.ties, lg.games, C.regTieRate), base.tie),
      over15P1: ratio(blend(lg.p1Over15, lg.p1Games, base.over15P1), base.over15P1),
      btts: ratio(blend(lg.p1Btts, lg.p1Games, base.btts), base.btts),
      over15P2: ratio(blend(lg.p2Over15, lg.p2Games, base.over15P2), base.over15P2),
      btts2: ratio(blend(lg.p2Btts, lg.p2Games, base.btts2), base.btts2),
      over45: ratio(blend(lg.over45, lg.games, base.over45), base.over45),
      over55: ratio(blend(lg.over55, lg.games, base.over55), base.over55),
    },
  };
}

function teamStrength(t: TeamRecent | undefined, ctx: LeagueCtx) {
  if (!t || t.gp === 0) return { att: 1, def: 1, att1: 1, def1: 1, att2: 1, def2: 1 };
  const k = MODEL_CFG.priorGames;
  const k1 = MODEL_CFG.priorGamesP1;
  const k2 = MODEL_CFG.priorGamesP2;
  return {
    att: (t.regGf + ctx.mu * k) / ((t.gp + k) * ctx.mu),
    def: (t.regGa + ctx.mu * k) / ((t.gp + k) * ctx.mu),
    // 1.º período: padrão próprio de cada equipa, também "puxado" para a média
    att1: t.p1n > 0 ? (t.p1For + ctx.mu1 * k1) / ((t.p1n + k1) * ctx.mu1) : 1,
    def1: t.p1n > 0 ? (t.p1Against + ctx.mu1 * k1) / ((t.p1n + k1) * ctx.mu1) : 1,
    // 2.º período, idem
    att2: t.p2n > 0 ? (t.p2For + ctx.mu2 * k2) / ((t.p2n + k2) * ctx.mu2) : 1,
    def2: t.p2n > 0 ? (t.p2Against + ctx.mu2 * k2) / ((t.p2n + k2) * ctx.mu2) : 1,
  };
}

const clamp01 = (x: number) => Math.min(0.99, Math.max(0.01, x));

/** Ajuste por lesões, em golos por jogo: golos que a equipa deixa de marcar / golos a mais que sofre. */
type GoalAdj = { offLoss: number; defLoss: number };
const NO_ADJ: GoalAdj = { offLoss: 0, defLoss: 0 };

/** Resultado de um período (ou de vários seguidos): casa ganha / empate / fora ganha, dois Poisson independentes. */
function periodOutcome(lh1: number, la1: number) {
  const ph = poissonPmf(lh1, 12);
  const pa = poissonPmf(la1, 12);
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let i = 0; i <= 12; i++) {
    for (let j = 0; j <= 12; j++) {
      const p = ph[i] * pa[j];
      if (i > j) home += p;
      else if (i < j) away += p;
      else draw += p;
    }
  }
  return { home, draw, away };
}

type Favorite = "home" | "away" | "even";

/**
 * Palpite de resultado: o resultado exato mais provável entre os que respeitam
 *  - o favorito (a vitória pode ser no prolongamento, ex.: 3–2) e
 *  - o total de golos esperado (soma arredondada), para ser coerente com o "Total" mostrado.
 * Em jogos equilibrados (sem favorito) o palpite é um empate aos 60 min, que se decide no prolongamento.
 */
function likelyScore(lh: number, la: number, favorite: Favorite, pHome: number) {
  const target = Math.max(1, Math.round(lh + la));

  if (favorite === "even") {
    if (target % 2 === 0) return `${target / 2}–${target / 2}`;
    const hi = (target + 1) / 2;
    const lo = (target - 1) / 2;
    return pHome >= 0.5 ? `${hi}–${lo}` : `${lo}–${hi}`;
  }

  const homeFav = favorite === "home";
  const ph = poissonPmf(lh, 14);
  const pa = poissonPmf(la, 14);
  let best = { i: homeFav ? target : 0, j: homeFav ? 0 : target, p: -1 };
  for (let i = 0; i <= target; i++) {
    const j = target - i;
    if (homeFav ? i <= j : j <= i) continue;
    const p = (ph[i] ?? 0) * (pa[j] ?? 0);
    if (p > best.p) best = { i, j, p };
  }
  return `${best.i}–${best.j}`;
}

function gameModel(
  home: TeamRecent | undefined,
  away: TeamRecent | undefined,
  ctx: LeagueCtx,
  tired: { home: boolean; away: boolean } = { home: false, away: false },
  adjHome: GoalAdj = NO_ADJ,
  adjAway: GoalAdj = NO_ADJ
) {
  const C = MODEL_CFG;
  const B2B = C.backToBack;
  const h = teamStrength(home, ctx);
  const a = teamStrength(away, ctx);

  const fh = (tired.home ? 1 + B2B.ownGoals : 1) * (tired.away ? 1 + B2B.oppGoals : 1);
  const fa = (tired.away ? 1 + B2B.ownGoals : 1) * (tired.home ? 1 + B2B.oppGoals : 1);

  const lh0 = ctx.mu * (1 + C.homeEdge) * h.att * a.def * fh;
  const la0 = ctx.mu * (1 - C.homeEdge) * a.att * h.def * fa;

  // Lesões: cada equipa marca menos (ataque) e o adversário marca mais (defesa e guarda-redes)
  const lh = Math.max(0.5, lh0 - adjHome.offLoss + adjAway.defLoss);
  const la = Math.max(0.5, la0 - adjAway.offLoss + adjHome.defLoss);
  const rh = lh0 > 0 ? lh / lh0 : 1;
  const ra = la0 > 0 ? la / la0 : 1;

  const lh1 = ctx.mu1 * (1 + C.homeEdge) * h.att1 * a.def1 * fh * rh;
  const la1 = ctx.mu1 * (1 - C.homeEdge) * a.att1 * h.def1 * fa * ra;

  const lh2 = ctx.mu2 * (1 + C.homeEdge) * h.att2 * a.def2 * fh * rh;
  const la2 = ctx.mu2 * (1 - C.homeEdge) * a.att2 * h.def2 * fa * ra;

  const m = rawMarkets(lh, la, lh1, la1, lh2, la2);
  const F = ctx.factors;

  const tie = Math.min(0.4, m.tie * F.tie);
  const decisive = m.hw + m.aw;
  const hw = decisive > 0 ? (m.hw * (1 - tie)) / decisive : (1 - tie) / 2;
  const pHome = clamp01(hw + tie * C.extraTimeHomeShare);
  const p1 = periodOutcome(lh1, la1);
  const homePct = Math.round(pHome * 100);
  const favorite: Favorite = Math.abs(homePct - 50) <= C.evenBand ? "even" : homePct > 50 ? "home" : "away";

  return {
    lh,
    la,
    lh1,
    la1,
    pHome,
    tie: clamp01(tie),
    over15P1: clamp01(m.over15P1 * F.over15P1),
    btts: clamp01(m.btts * F.btts),
    over15P2: clamp01(m.over15P2 * F.over15P2),
    btts2: clamp01(m.btts2 * F.btts2),
    over45: clamp01(m.over45 * F.over45),
    over55: clamp01(m.over55 * F.over55),
    p1,
    favorite,
    scoreGuess: likelyScore(lh, la, favorite, pHome),
    totalLine: Math.round((lh + la) * 2) / 2,
    scoreProbHome: 1 - Math.exp(-lh1),
    scoreProbAway: 1 - Math.exp(-la1),
    scoreProb2Home: 1 - Math.exp(-lh2),
    scoreProb2Away: 1 - Math.exp(-la2),
  };
}

// ─── Lesões (ESPN) e impacto de jogadores-chave ──────────────────────────────
// A API da NHL não tem lesões; a ESPN publica-as num endpoint público sem chave.
// Cada lesionado é validado contra o plantel atual da NHL (ignora entradas antigas ou de outras equipas)
// e ponderado pela importância do jogador: jogador de banco = impacto zero; titular importante = impacto real.

type InjuryEntry = { text: string; name: string; pos: string; status: string };
type InjuryMap = Map<string, InjuryEntry[]>;

const normName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function fetchInjuries(): Promise<InjuryMap | null> {
  const cached = await redis.get(INJURY_CACHE_KEY);
  if (cached) {
    try {
      return new Map(Object.entries(JSON.parse(cached) as Record<string, InjuryEntry[]>));
    } catch {
      /* ignora cache inválida */
    }
  }

  try {
    const res = await fetchWithTimeout(ESPN_INJURIES_URL, {}, 6000);
    if (!res.ok) return null;
    const data = await res.json();
    const teams = Array.isArray(data?.injuries) ? data.injuries : [];

    const out: Record<string, InjuryEntry[]> = {};
    for (const t of teams) {
      const name = normName(String(t?.displayName ?? t?.team?.displayName ?? ""));
      if (!name) continue;

      const rows: InjuryEntry[] = [];
      for (const i of Array.isArray(t?.injuries) ? t.injuries : []) {
        const player = String(i?.athlete?.displayName ?? i?.athlete?.fullName ?? "").trim();
        if (!player) continue;
        const pos = String(i?.athlete?.position?.abbreviation ?? i?.athlete?.position?.name ?? "").trim();
        const status = String(i?.status ?? i?.type?.description ?? "").trim();
        const body = String(i?.details?.type ?? i?.details?.detail ?? i?.details?.location ?? "").trim();
        const tag = [pos, status].filter(Boolean).join(", ");
        rows.push({ text: `${player}${tag ? ` (${tag})` : ""}${body ? ` – ${body}` : ""}`, name: player, pos, status });
      }
      out[name] = rows.slice(0, 25);
    }

    if (Object.keys(out).length === 0) return null;
    await redis.setPx(INJURY_CACHE_KEY, JSON.stringify(out), INJURY_CACHE_TTL_MS);
    return new Map(Object.entries(out));
  } catch (e) {
    console.error("[gemini] lesões (ESPN) falhou:", e);
    return null;
  }
}

/** Lesões de uma equipa (por nome completo). null = fonte indisponível. */
function injuryEntriesFor(map: InjuryMap | null, fullName: string): InjuryEntry[] | null {
  if (!map) return null;
  const n = normName(fullName);
  const exact = map.get(n);
  if (exact) return exact;
  // Fallback: mesma última palavra do nome (ex.: "Wings", "Leafs"), só se for inequívoco.
  const last = n.split(" ").pop();
  const hits = [...map.entries()].filter(([k]) => k.split(" ").pop() === last);
  return hits.length === 1 ? hits[0][1] : [];
}

// --- Estatísticas de jogadores e plantéis (NHL) --------------------------------

type PlayerStat = { id: number; name: string; pos: string; gp: number; pts: number; toi: number; gs: number; sa: number; sv: number };
type RosterPlayer = { id: number; name: string; pos: string };

const seasonIdFor = (date: string) => {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 9 ? y : y - 1;
  return `${start}${start + 1}`;
};
const prevSeasonId = (season: string) => {
  const y = Number(season.slice(0, 4));
  return `${y - 1}${y}`;
};

async function fetchSeasonPlayers(season: string): Promise<Map<number, PlayerStat> | null> {
  const key = `nhl:players:v1:${season}`;
  const cached = await redis.get(key);
  if (cached) {
    try {
      return new Map((JSON.parse(cached) as PlayerStat[]).map((p) => [p.id, p]));
    } catch {
      /* ignora cache inválida */
    }
  }

  try {
    const q = encodeURIComponent(`seasonId=${season} and gameTypeId=2`);
    const [sk, gk] = await Promise.all([
      fetchWithTimeout(`${STATS_REST}/skater/summary?limit=-1&cayenneExp=${q}`, {}, 15000),
      fetchWithTimeout(`${STATS_REST}/goalie/summary?limit=-1&cayenneExp=${q}`, {}, 15000),
    ]);
    if (!sk.ok || !gk.ok) return null;
    const [skData, gkData] = await Promise.all([sk.json(), gk.json()]);

    const list: PlayerStat[] = [];
    for (const r of Array.isArray(skData?.data) ? skData.data : []) {
      const id = num(r?.playerId);
      if (!id) continue;
      list.push({
        id,
        name: String(r?.skaterFullName ?? ""),
        pos: String(r?.positionCode ?? ""),
        gp: num(r?.gamesPlayed),
        pts: num(r?.points),
        toi: num(r?.timeOnIcePerGame), // segundos por jogo
        gs: 0,
        sa: 0,
        sv: 0,
      });
    }
    for (const r of Array.isArray(gkData?.data) ? gkData.data : []) {
      const id = num(r?.playerId);
      if (!id) continue;
      list.push({
        id,
        name: String(r?.goalieFullName ?? ""),
        pos: "G",
        gp: num(r?.gamesPlayed),
        pts: 0,
        toi: 0,
        gs: num(r?.gamesStarted),
        sa: num(r?.shotsAgainst),
        sv: num(r?.saves),
      });
    }

    // Sem dados (ex.: época atual ainda sem jogos): guarda pouco tempo para voltar a tentar em breve
    await redis.setPx(key, JSON.stringify(list), list.length ? PLAYERS_CACHE_TTL_MS : 60 * 60 * 1000);
    return new Map(list.map((p) => [p.id, p]));
  } catch (e) {
    console.error(`[gemini] estatísticas de jogadores ${season} falharam:`, e);
    return null;
  }
}

async function fetchRoster(abbr: string, season: string): Promise<RosterPlayer[] | null> {
  const key = `nhl:roster:v1:${abbr}`;
  const cached = await redis.get(key);
  if (cached) {
    try {
      return JSON.parse(cached) as RosterPlayer[];
    } catch {
      /* ignora cache inválida */
    }
  }

  const getJson = async (url: string) => {
    try {
      const res = await fetchWithTimeout(url, {}, 8000);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };
  const nameOf = (p: any) => `${p?.firstName?.default ?? ""} ${p?.lastName?.default ?? ""}`.trim();
  const fromGroups = (data: any): RosterPlayer[] => {
    const out: RosterPlayer[] = [];
    for (const [group, pos] of [["forwards", "F"], ["defensemen", "D"], ["goalies", "G"]] as const) {
      for (const p of Array.isArray(data?.[group]) ? data[group] : []) {
        const id = num(p?.id);
        if (!id) continue;
        out.push({ id, name: nameOf(p), pos: group === "forwards" ? String(p?.positionCode ?? pos) : pos });
      }
    }
    return out;
  };
  const fromClubStats = (data: any): RosterPlayer[] => {
    const out: RosterPlayer[] = [];
    for (const [group, isG] of [["skaters", false], ["goalies", true]] as const) {
      for (const p of Array.isArray(data?.[group]) ? data[group] : []) {
        const id = num(p?.playerId ?? p?.id);
        if (!id) continue;
        out.push({ id, name: nameOf(p), pos: isG ? "G" : String(p?.positionCode ?? "F") });
      }
    }
    return out;
  };

  const sources: (() => Promise<RosterPlayer[]>)[] = [
    async () => fromGroups(await getJson(`${NHL_API}/roster/${abbr}/current`)),
    async () => fromGroups(await getJson(`${NHL_API}/roster/${abbr}/${season}`)),
    async () => fromClubStats(await getJson(`${NHL_API}/club-stats/${abbr}/now`)),
  ];
  for (const run of sources) {
    const out = await run();
    if (out.filter((p) => p.pos !== "G").length >= 8) {
      await redis.setPx(key, JSON.stringify(out), ROSTER_CACHE_TTL_MS);
      return out;
    }
  }
  return null;
}

async function fetchRosters(abbrs: string[], season: string): Promise<Map<string, RosterPlayer[]>> {
  const list = await Promise.all(abbrs.map(async (a) => [a, await fetchRoster(a, season)] as const));
  const map = new Map<string, RosterPlayer[]>();
  for (const [a, r] of list) if (r) map.set(a, r);
  return map;
}

// --- Impacto das lesões --------------------------------------------------------
// Tudo em "golos por jogo". Parâmetros ajustáveis (estimativas razoáveis, a calibrar com o histórico).

const INJ_CFG = {
  prevSeasonWeight: 0.6, // peso da época passada nas estatísticas do jogador
  forward: { replacementPpg: 0.35, priorGames: 10, goalsPerPoint: 0.22, offShare: 0.8 },
  defense: { floorMinutes: 18.5, goalsPerMinute: 0.03, offShare: 0.4 },
  maxPerPlayer: 0.25,
  maxPerTeam: 0.5,
  minTag: 0.03, // abaixo disto o jogador é "de banco": sem etiqueta e sem efeito relevante
  goalie: {
    shotsAgainstPerGame: 29.5,
    priorSv: 0.903,
    priorShots: 1200,
    replacementSv: 0.895,
    minStarterShare: 0.55,
    maxStarterShare: 0.9,
    minDelta: -0.3,
    maxDelta: 0.45,
  },
} as const;

type TeamImpact = {
  offLoss: number; // golos que a equipa deixa de marcar
  defLoss: number; // golos a mais que sofre (defesas e guarda-redes)
  total: number;
  tags: Map<string, { value: number; label: string }>; // por texto da lesão
};

function statusWeight(status: string): number {
  const s = status.toLowerCase();
  if (/\bout\b|injured reserve|\bir\b|ltir|suspen/.test(s)) return 1;
  if (/doubtful/.test(s)) return 0.75;
  return 0.5; // day-to-day, questionable, etc.
}

function blendStat(cur?: PlayerStat, prev?: PlayerStat): PlayerStat | undefined {
  if (!cur && !prev) return undefined;
  const w = INJ_CFG.prevSeasonWeight;
  const base = (cur ?? prev)!;
  const c = cur ?? { ...base, gp: 0, pts: 0, toi: 0, gs: 0, sa: 0, sv: 0 };
  const p = prev ?? { ...base, gp: 0, pts: 0, toi: 0, gs: 0, sa: 0, sv: 0 };
  const gp = c.gp + w * p.gp;
  return {
    id: base.id,
    name: c.name || p.name,
    pos: c.pos || p.pos,
    gp,
    pts: c.pts + w * p.pts,
    toi: gp > 0 ? (c.toi * c.gp + w * p.toi * p.gp) / gp : 0,
    gs: c.gs + w * p.gs,
    sa: c.sa + w * p.sa,
    sv: c.sv + w * p.sv,
  };
}

function computeTeamInjuryImpact(
  entries: InjuryEntry[],
  roster: RosterPlayer[],
  cur: Map<number, PlayerStat> | null,
  prev: Map<number, PlayerStat> | null
): TeamImpact {
  const C = INJ_CFG;
  const out: TeamImpact = { offLoss: 0, defLoss: 0, total: 0, tags: new Map() };

  const byName = new Map(roster.map((p) => [normName(p.name), p]));
  const find = (name: string): RosterPlayer | undefined => {
    const n = normName(name);
    const exact = byName.get(n);
    if (exact) return exact;
    // apelido único no plantel + mesma inicial
    const parts = n.split(" ");
    const last = parts[parts.length - 1];
    const hits = roster.filter((p) => {
      const q = normName(p.name).split(" ");
      return q[q.length - 1] === last && q[0]?.[0] === parts[0]?.[0];
    });
    return hits.length === 1 ? hits[0] : undefined;
  };
  const stat = (id: number) => blendStat(cur?.get(id), prev?.get(id));

  const goalieInjury = new Map<number, { w: number; text: string }>();

  for (const e of entries) {
    const rp = find(e.name);
    if (!rp) continue; // não está no plantel atual: ignora (entrada antiga ou noutra equipa)
    const w = statusWeight(e.status);

    if (rp.pos === "G") {
      const prevW = goalieInjury.get(rp.id)?.w ?? 0;
      if (w >= prevW) goalieInjury.set(rp.id, { w, text: e.text });
      continue;
    }

    const s = stat(rp.id);
    if (!s || s.gp <= 0) continue;

    let value: number;
    let offShare: number;
    if (rp.pos === "D") {
      value = Math.max(0, s.toi / 60 - C.defense.floorMinutes) * C.defense.goalsPerMinute;
      offShare = C.defense.offShare;
    } else {
      const ppg = (s.pts + C.forward.replacementPpg * C.forward.priorGames) / (s.gp + C.forward.priorGames);
      value = Math.max(0, ppg - C.forward.replacementPpg) * C.forward.goalsPerPoint;
      offShare = C.forward.offShare;
    }
    value = Math.min(C.maxPerPlayer, value) * w;
    if (value <= 0) continue;

    out.offLoss += value * offShare;
    out.defLoss += value * (1 - offShare);
    if (value >= C.minTag) out.tags.set(e.text, { value, label: `impacto −${value.toFixed(2)} golos` });
  }

  // Guarda-redes: o que conta é perder o titular (o suplente defende pior)
  const G = C.goalie;
  const goalies = roster
    .filter((p) => p.pos === "G")
    .map((p) => ({ p, s: stat(p.id) }))
    .filter((x): x is { p: RosterPlayer; s: PlayerStat } => !!x.s)
    .sort((a, b) => b.s.gs - a.s.gs);

  if (goalies.length > 0) {
    const sv = (s: PlayerStat) => (s.sv + G.priorSv * G.priorShots) / (s.sa + G.priorShots);
    const starter = goalies[0];
    const injured = goalieInjury.get(starter.p.id);

    if (injured) {
      const others = goalies.slice(1);
      const totalGs = goalies.reduce((sum, g) => sum + g.s.gs, 0);
      const share = totalGs > 0 ? Math.min(G.maxStarterShare, Math.max(G.minStarterShare, starter.s.gs / totalGs)) : 0.7;
      const svStarter = sv(starter.s);
      const healthy = others.filter((g) => (goalieInjury.get(g.p.id)?.w ?? 0) < 1);
      const svBackupToday = healthy.length ? sv(healthy[0].s) : G.replacementSv;
      const svBackupTypical = others.length ? sv(others[0].s) : G.replacementSv;

      const typical = share * svStarter + (1 - share) * svBackupTypical;
      const pStart = (1 - injured.w) * share; // hipótese de o titular jogar hoje
      const today = pStart * svStarter + (1 - pStart) * svBackupToday;
      const delta = Math.min(G.maxDelta, Math.max(G.minDelta, G.shotsAgainstPerGame * (typical - today)));

      if (delta > 0) {
        out.defLoss += delta;
        if (delta >= C.minTag) {
          out.tags.set(injured.text, { value: delta, label: `guarda-redes titular: −${delta.toFixed(2)} golos` });
        }
      }
    }
  }

  // Limite por equipa, para uma lista errada da ESPN não estragar um jogo todo
  const raw = out.offLoss + out.defLoss;
  if (raw > C.maxPerTeam) {
    const k = C.maxPerTeam / raw;
    out.offLoss *= k;
    out.defLoss *= k;
  }
  out.total = out.offLoss + out.defLoss;
  return out;
}

async function buildImpacts(
  date: string,
  games: NhlGame[],
  injuries: InjuryMap | null
): Promise<Map<string, TeamImpact> | null> {
  if (!injuries) return null;
  const season = seasonIdFor(date);
  const abbrs = [...new Set(games.flatMap((g) => [g.homeAbbr, g.awayAbbr]))];

  const [cur, prev, rosters] = await Promise.all([
    fetchSeasonPlayers(season),
    fetchSeasonPlayers(prevSeasonId(season)),
    fetchRosters(abbrs, season),
  ]);
  if (!cur && !prev) return null;
  if (rosters.size === 0) return null;

  const impacts = new Map<string, TeamImpact>();
  for (const g of games) {
    for (const [abbr, name] of [[g.homeAbbr, g.homeName], [g.awayAbbr, g.awayName]] as const) {
      const entries = injuryEntriesFor(injuries, name);
      const roster = rosters.get(abbr);
      if (!entries || !roster) continue;
      impacts.set(abbr, computeTeamInjuryImpact(entries, roster, cur, prev));
    }
  }
  return impacts;
}

/** Texto das lesões para o ecrã: jogadores com impacto primeiro, cada um com a sua etiqueta. */
function injuryDisplay(entries: InjuryEntry[] | null, impact?: TeamImpact): string[] {
  if (!entries) return ["Sem dados de lesões (fonte indisponível)"];
  const ranked = entries
    .map((e) => ({ e, tag: impact?.tags.get(e.text) }))
    .sort((a, b) => (b.tag?.value ?? 0) - (a.tag?.value ?? 0));
  return ranked.slice(0, MAX_INJURIES_PER_TEAM).map(({ e, tag }) => (tag ? `${e.text} · ${tag.label}` : e.text));
}

// ─── Resumos (Groq, opcional) ────────────────────────────────────────────────

const f1 = (n: number) => n.toFixed(1);
const pct = (x: number) => Math.round(x * 100);

function describeTeam(label: string, t?: TeamRecent) {
  if (!t || t.gp === 0) return `${label}: sem jogos terminados nos últimos ${LOOKBACK_DAYS} dias.`;
  let s =
    `${label}: ${t.gp} jogo(s)` +
    (t.preGp > 0 ? ` (${t.preGp} de pré-época)` : "") +
    `, V-D-DP ${t.w}-${t.l}-${t.otl}, golos ${f1(t.gf / t.gp)} marcados / ${f1(t.ga / t.gp)} sofridos por jogo`;
  if (t.p1n > 0) {
    s += `, golos no 1.º período ${f1(t.p1For / t.p1n)} marcados / ${f1(t.p1Against / t.p1n)} sofridos`;
  }
  return s;
}

type Expected = { lh: number; la: number };

function fallbackSummary(
  g: NhlGame,
  e: Expected,
  p: Prediction,
  home?: TeamRecent,
  away?: TeamRecent,
  tired: { home: boolean; away: boolean } = { home: false, away: false }
) {
  const homeFav = p.winProbabilityHome >= 50;
  const fav = homeFav ? g.homeAbbr : g.awayAbbr;
  const favP = homeFav ? p.winProbabilityHome : p.winProbabilityAway;
  const verdict =
    p.favorite === "even"
      ? `Jogo equilibrado (${g.homeAbbr} ${p.winProbabilityHome}% / ${g.awayAbbr} ${p.winProbabilityAway}%).`
      : `${fav} favorito (${favP}%).`;
  if ((home?.gp ?? 0) + (away?.gp ?? 0) === 0) {
    return `Sem jogos recentes de ${g.homeAbbr} e ${g.awayAbbr}: estimativa pelas médias da liga e vantagem de jogar em casa. ${verdict}`;
  }
  const tiredNote = [tired.home ? g.homeAbbr : "", tired.away ? g.awayAbbr : ""].filter(Boolean);
  return (
    (tiredNote.length ? `${tiredNote.join(" e ")} ${tiredNote.length > 1 ? "jogaram" : "jogou"} ontem (cansaço). ` : "") +
    `${verdict} Golos esperados: ${g.homeAbbr} ${f1(e.lh)}, ${g.awayAbbr} ${f1(e.la)} ` +
    `(total ${f1(e.lh + e.la)}). Base: ${home?.gp ?? 0} jogo(s) de ${g.homeAbbr} e ${away?.gp ?? 0} de ${g.awayAbbr} nos seus últimos jogos.`
  );
}

function buildSummaryPrompt(
  date: string,
  games: NhlGame[],
  predictions: Prediction[],
  expected: Map<string, Expected>,
  form: Map<string, TeamRecent>,
  inj: InjuryMap | null,
  tiredTeams: Set<string>,
  impacts: Map<string, TeamImpact> | null
) {
  const b2b = (abbr: string) => (tiredTeams.has(abbr) ? " | JOGOU ONTEM (2.ª noite seguida)" : "");
  const injLine = (abbr: string, name: string) => {
    const entries = injuryEntriesFor(inj, name);
    if (!entries || entries.length === 0) return "";
    const impact = impacts?.get(abbr);
    const list = injuryDisplay(entries, impact);
    const adj = impact && impact.total >= INJ_CFG.minTag ? ` (ajuste total já incluído nos números: −${impact.total.toFixed(2)} golos)` : "";
    return `\n    Lesões (ESPN)${adj}: ${list.join("; ")}`;
  };

  const block = games
    .map((g, i) => {
      const p = predictions[i];
      const e = expected.get(p.id)!;
      return [
        `id=${g.id} | ${g.homeAbbr} (casa) vs ${g.awayAbbr} (fora)`,
        `  FAVORITO DO MODELO: ${p.favorite === "even" ? `NENHUM (jogo equilibrado, ${p.winProbabilityHome}% / ${p.winProbabilityAway}%)` : p.favorite === "home" ? `${g.homeAbbr} (${p.winProbabilityHome}%)` : `${g.awayAbbr} (${p.winProbabilityAway}%)`}`,
        `  Modelo: vitória casa ${p.winProbabilityHome}% / fora ${p.winProbabilityAway}%; empate aos 60 min ${p.drawTRProb}%; 2+ golos no 1.º período ${p.over15P1Prob}%; ambas marcam no 1.º período ${p.bttsP1Prob}%; 5+ golos ${p.over45Prob}%; 6+ golos ${p.over55Prob}%; golos esperados ${g.homeAbbr} ${f1(e.lh)} / ${g.awayAbbr} ${f1(e.la)}`,
        `  ${describeTeam(`CASA ${g.homeAbbr}`, form.get(g.homeAbbr))}${b2b(g.homeAbbr)}${injLine(g.homeAbbr, g.homeName)}`,
        `  ${describeTeam(`FORA ${g.awayAbbr}`, form.get(g.awayAbbr))}${b2b(g.awayAbbr)}${injLine(g.awayAbbr, g.awayName)}`,
      ].join("\n");
    })
    .join("\n");

  return `És o redator do NHL Tipsterz. Os números de cada jogo (${date}) já foram calculados por um modelo estatístico com a forma dos últimos ${TEAM_GAMES} jogos de cada equipa. NÃO alteres nem recalcules percentagens.

A tua tarefa: para cada jogo, escrever "analysisSummary" com 1 a 2 frases diretas em português de Portugal:
- o favorito é EXATAMENTE o indicado em "FAVORITO DO MODELO": não nomeies outra equipa como favorita (mesmo que defenda melhor ou marque mais). Se disser "NENHUM", diz que o jogo está equilibrado e explica o que se compensa (ex.: "ambas marcam ~3.0 por jogo, mas X defende melhor, daí o equilíbrio"); se os números dão uma ligeira vantagem a um lado (ex.: 50.4% contra 49.6%), podes referi-la como "ligeira vantagem", mas sem lhe chamar favorito. Justifica usando só os números fornecidos (golos marcados/sofridos, forma, golos esperados). Escreve sempre "golos esperados", nunca "xG";
- se uma equipa jogou ontem (2.ª noite seguida), refere o cansaço quando for relevante;
- os números JÁ incluem o ajuste por lesões indicado (jogadores-chave e guarda-redes titular; jogadores de banco não pesam). Refere o ausente mais importante quando ele muda o favorito ou o total de golos; NÃO repitas a lista completa de lesões (aparece por baixo do resumo);
- não inventes lesões, alinhamentos nem resultados; sem avisos genéricos.

JOGOS:
${block}

Responde EXCLUSIVAMENTE com JSON, um objeto por jogo, com o "id" exatamente como indicado:
{"games":[{"id":"...","analysisSummary":"..."}]}`;
}

async function askGroqSummaries(apiKey: string, prompt: string): Promise<Map<string, string>> {
  const res = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_completion_tokens: 4000,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: "Gera o JSON pedido." },
        ],
      }),
    },
    22000
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Groq HTTP ${res.status}`);

  const content = String(data?.choices?.[0]?.message?.content ?? "{}")
    .replace(/```json|```/g, "")
    .trim();
  const parsed = JSON.parse(content);
  const list: any[] = Array.isArray(parsed?.games) ? parsed.games : Array.isArray(parsed?.predictions) ? parsed.predictions : [];
  const out = new Map<string, string>();
  for (const item of list) {
    if (item?.id != null && typeof item?.analysisSummary === "string" && item.analysisSummary.trim()) {
      out.set(String(item.id), item.analysisSummary.trim());
    }
  }
  if (out.size === 0) throw new Error("Resposta da IA sem resumos.");
  return out;
}

// ─── Montagem das previsões ──────────────────────────────────────────────────

const record = (t?: TeamRecent) => (t ? `${t.w}-${t.l}-${t.otl}` : "0-0-0");

const teamP1 = (t: TeamRecent | undefined, scoreProb: number): TeamP1Stats => ({
  n: t?.p1n ?? 0,
  scored: t?.p1Scored ?? 0,
  conceded: t?.p1Conceded ?? 0,
  over15: t?.p1Over15 ?? 0,
  btts: t?.p1Btts ?? 0,
  scoreProb: pct(scoreProb),
});

const teamP2 = (t: TeamRecent | undefined, scoreProb: number): TeamP1Stats => ({
  n: t?.p2n ?? 0,
  scored: t?.p2Scored ?? 0,
  conceded: t?.p2Conceded ?? 0,
  over15: t?.p2Over15 ?? 0,
  btts: t?.p2Btts ?? 0,
  scoreProb: pct(scoreProb),
});

/** Percentagens de um resultado 3-vias que somam sempre 100. */
const threeWay = (o: { home: number; draw: number; away: number }) => {
  const home = pct(o.home);
  const draw = pct(o.draw);
  return { home, draw, away: Math.max(0, 100 - home - draw) };
};

function buildPredictions(
  games: NhlGame[],
  form: Map<string, TeamRecent>,
  ctx: LeagueCtx,
  tiredTeams: Set<string>,
  injuries: InjuryMap | null,
  impacts: Map<string, TeamImpact> | null
) {
  const expected = new Map<string, Expected>();

  const predictions: Prediction[] = games.map((g) => {
    const home = form.get(g.homeAbbr);
    const away = form.get(g.awayAbbr);
    const tired = { home: tiredTeams.has(g.homeAbbr), away: tiredTeams.has(g.awayAbbr) };
    const ih = impacts?.get(g.homeAbbr);
    const ia = impacts?.get(g.awayAbbr);
    const m = gameModel(
      home,
      away,
      ctx,
      tired,
      ih ? { offLoss: ih.offLoss, defLoss: ih.defLoss } : NO_ADJ,
      ia ? { offLoss: ia.offLoss, defLoss: ia.defLoss } : NO_ADJ
    );
    // 1 casa decimal: um jogo "50/50" pode ser 49.6 / 50.4 (o ecrã arredonda o destaque, mas mostra o decimal)
    const winHome = Math.round(m.pHome * 1000) / 10;
    const w1 = threeWay(m.p1);

    const p: Prediction = {
      id: String(g.id),
      homeTeam: g.homeName,
      homeTeamAbbr: g.homeAbbr,
      homeRecordL10: record(home),
      awayTeam: g.awayName,
      awayTeamAbbr: g.awayAbbr,
      awayRecordL10: record(away),
      dateTime: g.startTimeUTC,
      winProbabilityHome: winHome,
      winProbabilityAway: Math.round((100 - winHome) * 10) / 10,
      over15P1Prob: pct(m.over15P1),
      bttsP1Prob: pct(m.btts),
      drawTRProb: pct(m.tie),
      over45Prob: pct(m.over45),
      over55Prob: pct(m.over55),
      analysisSummary: "",
      injuries: {
        home: injuryDisplay(injuryEntriesFor(injuries, g.homeName), ih),
        away: injuryDisplay(injuryEntriesFor(injuries, g.awayName), ia),
      },
      expGoalsHome: Math.round(m.lh * 100) / 100,
      expGoalsAway: Math.round(m.la * 100) / 100,
      homeGames: home?.gp ?? 0,
      awayGames: away?.gp ?? 0,
      homeB2B: tired.home,
      awayB2B: tired.away,
      favorite: m.favorite,
      scoreGuess: m.scoreGuess,
      totalLine: m.totalLine,
      p1WinHome: w1.home,
      p1Draw: w1.draw,
      p1WinAway: w1.away,
      over15P2Prob: pct(m.over15P2),
      homeP1: teamP1(home, m.scoreProbHome),
      awayP1: teamP1(away, m.scoreProbAway),
      homeP2: teamP2(home, m.scoreProb2Home),
      awayP2: teamP2(away, m.scoreProb2Away),
      injuryAdj: { home: Math.round((ih?.total ?? 0) * 100) / 100, away: Math.round((ia?.total ?? 0) * 100) / 100 },
    };
    const e = { lh: m.lh, la: m.la };
    expected.set(p.id, e);
    p.analysisSummary = fallbackSummary(g, e, p, home, away, tired);
    return p;
  });

  return { predictions, expected };
}

// ─── Cache (Redis) ───────────────────────────────────────────────────────────

async function readCache(date: string): Promise<AnalysisPayload | null> {
  const raw = await redis.get(`${CACHE_PREFIX}${date}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.predictions) ? parsed : null;
  } catch {
    return null;
  }
}

/** Limpa as análises em cache (qualquer versão). Os golos do 1.º período de jogos antigos ficam, porque nunca mudam. */
async function clearCache(): Promise<number> {
  let cursor = "0";
  let removed = 0;
  for (let i = 0; i < 20; i++) {
    const r = await redis.scan(cursor, "nhl:analysis:*", 100);
    if (!r) break;
    cursor = r[0];
    for (const key of r[1]) {
      await redis.del(key);
      removed++;
    }
    if (cursor === "0") break;
  }
  return removed;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const date = String(body?.selectedDate ?? body?.date ?? "").trim();
    const force = body?.force === true;

    if (!isDate(date)) return json({ message: "Data inválida (usa YYYY-MM-DD)." }, 400);

    if (!force) {
      const cached = await readCache(date);
      if (cached) return json({ ...cached, meta: { ...cached.meta, cached: true } });
    }

    let games: NhlGame[];
    try {
      games = await fetchGames(date);
    } catch (e: any) {
      return json({ message: e?.message || "Não foi possível obter o calendário da NHL." }, 502);
    }

    if (games.length === 0) {
      return json({
        predictions: [],
        lastUpdated: new Date().toISOString(),
        meta: { source: "model", games: 0, note: "Sem jogos da NHL nesta data." },
      });
    }

    // Últimos 7 jogos de cada equipa
    const { games: allRecent, failedDays } = await fetchFinishedGames(date);
    const teams = games.flatMap((g) => [g.homeAbbr, g.awayAbbr]);
    const { perTeam, used, regularSeasonDay } = selectRecentGames(allRecent, date, teams);
    await enrichFirstPeriod(used);
    const form = aggregateTeams(perTeam);
    const ctx = buildLeagueCtx(leagueRates(used));
    const preseasonGames = used.filter((g) => g.gameType === 1).length;
    const from = used.length ? used.map((g) => g.date).sort()[0] : addDays(date, -LOOKBACK_DAYS);
    const to = addDays(date, -1);

    // Equipas que jogaram ontem (2.ª noite seguida)
    const yesterday = addDays(date, -1);
    const tiredTeams = new Set(
      allRecent.filter((g) => g.date === yesterday).flatMap((g) => [g.homeAbbr, g.awayAbbr])
    );

    // Lesões (ESPN) → impacto por jogador-chave, validado contra os plantéis da NHL
    const injuries = await fetchInjuries();
    const injMeta = { source: injuries ? ("espn" as const) : ("unavailable" as const), teams: injuries?.size ?? 0 };
    const impacts = await buildImpacts(date, games, injuries).catch((e) => {
      console.error("[gemini] impacto das lesões falhou:", e);
      return null;
    });
    const impactMeta = {
      source: impacts ? ("ok" as const) : ("unavailable" as const),
      teamsAffected: impacts ? [...impacts.values()].filter((i) => i.total >= INJ_CFG.minTag).length : 0,
    };

    // Probabilidades: modelo estatístico (não dependem da IA)
    const { predictions, expected } = buildPredictions(games, form, ctx, tiredTeams, injuries, impacts);

    // Resumos: IA (opcional). Se falhar, ficam os resumos automáticos.
    let aiError: string | null = null;
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      aiError = "GROQ_API_KEY não configurada na Vercel.";
    } else {
      try {
        const summaries = await askGroqSummaries(
          apiKey,
          buildSummaryPrompt(date, games, predictions, expected, form, injuries, tiredTeams, impacts)
        );
        for (const p of predictions) {
          const text = summaries.get(p.id);
          if (text) p.analysisSummary = text;
        }
      } catch (e: any) {
        aiError = e?.message || "Erro na IA.";
        console.error("[gemini] Groq falhou:", aiError);
      }
    }

    const notes: string[] = [];
    if (aiError) notes.push(`Resumos automáticos (IA indisponível: ${aiError}).`);
    if (!injuries) notes.push("Lesões indisponíveis (fonte ESPN sem resposta ou com formato inesperado).");
    else if (!impacts) notes.push("Impacto das lesões indisponível (estatísticas de jogadores ou plantéis sem resposta): lesões só informativas.");
    if (failedDays > 0) notes.push(`Falhou a leitura de ${failedDays} dia(s) da procura dos últimos jogos (${LOOKBACK_DAYS} dias).`);

    const payload: AnalysisPayload = {
      predictions,
      lastUpdated: new Date().toISOString(),
      meta: {
        source: "model",
        games: predictions.length,
        window: { from, to, gamesUsed: used.length, preseasonGames, regularSeasonDay, gamesPerTeam: TEAM_GAMES },
        backToBack: games.flatMap((g) => [g.homeAbbr, g.awayAbbr]).filter((t) => tiredTeams.has(t)),
        injuries: injMeta,
        injuryImpact: impactMeta,
        ...(notes.length ? { note: notes.join(" ") } : {}),
      },
    };

    // Só guardamos em cache resultados completos (sem falhas de leitura nem da IA).
    if (!aiError && failedDays === 0) {
      await redis.setPx(`${CACHE_PREFIX}${date}`, JSON.stringify(payload), CACHE_TTL_MS);
    }

    return json(payload);
  } catch (e: any) {
    return json({ message: e?.message || "Erro interno no servidor." }, 500);
  }
}

export async function DELETE() {
  const removed = await clearCache();
  return json({ success: true, removed, message: "Cache limpa!" });
}