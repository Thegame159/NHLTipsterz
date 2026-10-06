// api/gemini.ts
// Fluxo: calendário (NHL) + resultados dos ÚLTIMOS 7 DIAS (NHL) → modelo estatístico (Poisson) → probabilidades.
// A IA (Groq) só escreve o resumo de cada jogo; os números vêm do modelo, não da IA.
//
// Janela de forma: os 7 dias de calendário anteriores à data analisada, haja ou não jogos de cada equipa.
// - Nos primeiros dias da época regular, a janela apanha jogos de pré-época (que contam, com menos peso).
// - No 8.º dia da época regular a janela (dias 1 a 7) já só tem jogos da época regular, por construção.

import { redis } from "./_redis.js";

export const config = { runtime: "edge" };

const NHL_API = "https://api-web.nhle.com/v1";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const WINDOW_DAYS = 7;
const CACHE_PREFIX = "nhl:analysis:v3:";
const CACHE_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas
const GAME_CACHE_PREFIX = "nhl:game:v1:"; // golos do 1.º período de jogos já terminados (nunca mudam)
const GAME_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ESPN_INJURIES_URL = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries";
const INJURY_CACHE_KEY = "nhl:injuries:v1";
const INJURY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos
const MAX_INJURIES_PER_TEAM = 8;
const MAX_PBP_FETCHES = 80;
const PBP_BATCH = 10;

// Parâmetros do modelo estatístico (ajustáveis).
const MODEL_CFG = {
  priorGames: 40, // peso (em jogos) da média da liga na força de ataque/defesa (a diferença real entre equipas é pequena face ao ruído de poucos jogos)
  leagueGoalsPerGame: 6.1, // golos totais por jogo em tempo regulamentar (referência da liga)
  leaguePriorGames: 30, // peso dessa referência quando se calculam as médias da janela
  rateBlendGames: 40, // peso da referência ao calibrar as taxas da liga (empate, 1.º período, totais)
  homeEdge: 0.05, // vantagem de casa: +5% golos esperados em casa, -5% fora
  regTieRate: 0.22, // empates ao fim dos 60 min (NHL 2016-17 a 2024-25: entre 20,5% e 23,5%)
  p1Share: 0.31, // fração dos golos que cai no 1.º período
  extraTimeHomeShare: 0.5, // quem vence o prolongamento/desempate: 50/50
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
  over45: number;
  over55: number;
};

type Prediction = {
  id: string;
  homeTeam: string;
  homeTeamAbbr: string;
  homeRecordL10: string; // agora: registo V-D-DP dos últimos 7 dias
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
};

type AnalysisPayload = {
  predictions: Prediction[];
  lastUpdated: string;
  meta: {
    source: "model";
    games: number;
    window?: { from: string; to: string; gamesUsed: number; preseasonGames: number };
    injuries?: { source: "espn" | "unavailable"; teams: number };
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

// ─── Forma recente (últimos 7 dias) ──────────────────────────────────────────

async function fetchFinishedGames(date: string): Promise<{ games: FinishedGame[]; failedDays: number }> {
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(date, -(i + 1)));
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
      });
    }
  }

  return { games, failedDays };
}

async function fetchP1Goals(gameId: number): Promise<{ h: number; a: number } | null> {
  try {
    const res = await fetchWithTimeout(`${NHL_API}/gamecenter/${gameId}/play-by-play`, {}, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    const homeId = data?.homeTeam?.id;
    const awayId = data?.awayTeam?.id;
    if (homeId == null || awayId == null) return null;

    let h = 0;
    let a = 0;
    for (const p of Array.isArray(data?.plays) ? data.plays : []) {
      if (p?.typeDescKey !== "goal" || p?.periodDescriptor?.number !== 1) continue;
      const owner = p?.details?.eventOwnerTeamId;
      if (owner === homeId) h++;
      else if (owner === awayId) a++;
    }
    return { h, a };
  } catch {
    return null;
  }
}

/** Preenche os golos do 1.º período. Jogos terminados não mudam, por isso ficam em cache no Redis. */
async function enrichFirstPeriod(games: FinishedGame[]) {
  const cached = await Promise.all(games.map((g) => redis.get(`${GAME_CACHE_PREFIX}${g.id}`)));
  const missing: FinishedGame[] = [];

  games.forEach((g, i) => {
    const raw = cached[i];
    if (raw) {
      try {
        const v = JSON.parse(raw);
        if (Number.isFinite(v?.h) && Number.isFinite(v?.a)) {
          g.p1Home = v.h;
          g.p1Away = v.a;
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
    const results = await Promise.all(batch.map((g) => fetchP1Goals(g.id)));
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (!r) continue;
      batch[j].p1Home = r.h;
      batch[j].p1Away = r.a;
      await redis.setPx(`${GAME_CACHE_PREFIX}${batch[j].id}`, JSON.stringify(r), GAME_CACHE_TTL_MS);
    }
  }
}

/** Golos em tempo regulamentar: no prolongamento/desempate o golo decisivo conta fora dos 60 min. */
const regTotal = (g: FinishedGame) =>
  g.homeScore + g.awayScore - (g.ending === "OT" || g.ending === "SO" ? 1 : 0);

function aggregateTeams(games: FinishedGame[]): Map<string, TeamRecent> {
  const map = new Map<string, TeamRecent>();
  const get = (abbr: string) => {
    let t = map.get(abbr);
    if (!t) {
      t = { abbr, gp: 0, preGp: 0, w: 0, l: 0, otl: 0, gf: 0, ga: 0, regGf: 0, regGa: 0, over45: 0, over55: 0, regTies: 0, p1n: 0, p1Over15: 0, p1Btts: 0, p1For: 0, p1Against: 0 };
      map.set(abbr, t);
    }
    return t;
  };

  for (const g of games) {
    const total = regTotal(g);
    const wentExtra = g.ending === "OT" || g.ending === "SO";

    for (const side of ["home", "away"] as const) {
      const abbr = side === "home" ? g.homeAbbr : g.awayAbbr;
      if (!abbr) continue;
      const own = side === "home" ? g.homeScore : g.awayScore;
      const opp = side === "home" ? g.awayScore : g.homeScore;
      const t = get(abbr);

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
        t.p1For += side === "home" ? g.p1Home : g.p1Away;
        t.p1Against += side === "home" ? g.p1Away : g.p1Home;
      }
    }
  }
  return map;
}

function leagueRates(games: FinishedGame[]): LeagueRates {
  const p1 = games.filter((g) => g.p1Home != null && g.p1Away != null);
  return {
    games: games.length,
    p1Games: p1.length,
    regGoalsSum: games.reduce((sum, g) => sum + regTotal(g), 0),
    p1GoalsSum: p1.reduce((sum, g) => sum + g.p1Home! + g.p1Away!, 0),
    p1RegGoalsSum: p1.reduce((sum, g) => sum + regTotal(g), 0),
    ties: games.filter((g) => g.ending === "OT" || g.ending === "SO").length,
    p1Over15: p1.filter((g) => g.p1Home! + g.p1Away! >= 2).length,
    p1Btts: p1.filter((g) => g.p1Home! > 0 && g.p1Away! > 0).length,
    over45: games.filter((g) => regTotal(g) >= 5).length,
    over55: games.filter((g) => regTotal(g) >= 6).length,
  };
}

// ─── Modelo estatístico (Poisson) ────────────────────────────────────────────
// 1. Golos esperados de cada equipa = média da liga × ataque próprio × defesa do adversário × vantagem de casa.
//    Ataque/defesa vêm dos últimos 7 dias, "puxados" para a média da liga (poucos jogos = pouca confiança).
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

type RawMarkets = { hw: number; aw: number; tie: number; over15P1: number; btts: number; over45: number; over55: number };

function rawMarkets(lh: number, la: number, share: number): RawMarkets {
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
  const s1h = lh * share;
  const s1a = la * share;
  const s = s1h + s1a;
  return {
    hw,
    aw,
    tie,
    over15P1: 1 - Math.exp(-s) * (1 + s),
    btts: (1 - Math.exp(-s1h)) * (1 - Math.exp(-s1a)),
    over45: poissonAtLeast(lh + la, 5),
    over55: poissonAtLeast(lh + la, 6),
  };
}

type LeagueCtx = {
  mu: number; // golos esperados por equipa num jogo médio
  share: number;
  factors: { tie: number; over15P1: number; btts: number; over45: number; over55: number };
};

function buildLeagueCtx(lg: LeagueRates): LeagueCtx {
  const C = MODEL_CFG;
  const totalGoals = (lg.regGoalsSum + C.leagueGoalsPerGame * C.leaguePriorGames) / (lg.games + C.leaguePriorGames);
  const mu = totalGoals / 2;
  const share =
    (lg.p1GoalsSum + C.p1Share * C.leagueGoalsPerGame * C.leaguePriorGames) /
    (lg.p1RegGoalsSum + C.leagueGoalsPerGame * C.leaguePriorGames);

  const base = rawMarkets(mu * (1 + C.homeEdge), mu * (1 - C.homeEdge), share);
  const rate = (count: number, n: number) => (n > 0 ? count / n : 0);
  const blend = (count: number, n: number, prior: number) =>
    (rate(count, n) * n + prior * C.rateBlendGames) / (n + C.rateBlendGames);
  const ratio = (target: number, model: number) => (model > 0 ? target / model : 1);

  return {
    mu,
    share,
    factors: {
      tie: ratio(blend(lg.ties, lg.games, C.regTieRate), base.tie),
      over15P1: ratio(blend(lg.p1Over15, lg.p1Games, base.over15P1), base.over15P1),
      btts: ratio(blend(lg.p1Btts, lg.p1Games, base.btts), base.btts),
      over45: ratio(blend(lg.over45, lg.games, base.over45), base.over45),
      over55: ratio(blend(lg.over55, lg.games, base.over55), base.over55),
    },
  };
}

function teamStrength(t: TeamRecent | undefined, mu: number) {
  if (!t || t.gp === 0) return { att: 1, def: 1 };
  const k = MODEL_CFG.priorGames;
  return {
    att: (t.regGf + mu * k) / ((t.gp + k) * mu),
    def: (t.regGa + mu * k) / ((t.gp + k) * mu),
  };
}

const clamp01 = (x: number) => Math.min(0.99, Math.max(0.01, x));

function gameModel(home: TeamRecent | undefined, away: TeamRecent | undefined, ctx: LeagueCtx) {
  const C = MODEL_CFG;
  const h = teamStrength(home, ctx.mu);
  const a = teamStrength(away, ctx.mu);
  const lh = ctx.mu * (1 + C.homeEdge) * h.att * a.def;
  const la = ctx.mu * (1 - C.homeEdge) * a.att * h.def;
  const m = rawMarkets(lh, la, ctx.share);
  const F = ctx.factors;

  const tie = Math.min(0.4, m.tie * F.tie);
  const decisive = m.hw + m.aw;
  const hw = decisive > 0 ? (m.hw * (1 - tie)) / decisive : (1 - tie) / 2;

  return {
    lh,
    la,
    pHome: clamp01(hw + tie * C.extraTimeHomeShare),
    tie: clamp01(tie),
    over15P1: clamp01(m.over15P1 * F.over15P1),
    btts: clamp01(m.btts * F.btts),
    over45: clamp01(m.over45 * F.over45),
    over55: clamp01(m.over55 * F.over55),
  };
}

// ─── Lesões (ESPN, não oficial) ──────────────────────────────────────────────
// A API da NHL não tem lesões. A ESPN publica-as num endpoint público sem chave.
// Se o formato mudar ou a fonte falhar, a UI mostra "Sem dados de lesões" em vez de inventar.

type InjuryMap = Map<string, string[]>;

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
      return new Map(Object.entries(JSON.parse(cached) as Record<string, string[]>));
    } catch {
      /* ignora cache inválida */
    }
  }

  try {
    const res = await fetchWithTimeout(ESPN_INJURIES_URL, {}, 6000);
    if (!res.ok) return null;
    const data = await res.json();
    const teams = Array.isArray(data?.injuries) ? data.injuries : [];

    const out: Record<string, string[]> = {};
    for (const t of teams) {
      const name = normName(String(t?.displayName ?? t?.team?.displayName ?? ""));
      if (!name) continue;

      const rows: { text: string; goalie: boolean }[] = [];
      for (const i of Array.isArray(t?.injuries) ? t.injuries : []) {
        const player = String(i?.athlete?.displayName ?? i?.athlete?.fullName ?? "").trim();
        if (!player) continue;
        const pos = String(i?.athlete?.position?.abbreviation ?? i?.athlete?.position?.name ?? "").trim();
        const status = String(i?.status ?? i?.type?.description ?? "").trim();
        const body = String(i?.details?.type ?? i?.details?.detail ?? i?.details?.location ?? "").trim();
        const tag = [pos, status].filter(Boolean).join(", ");
        rows.push({
          text: `${player}${tag ? ` (${tag})` : ""}${body ? ` – ${body}` : ""}`,
          goalie: pos.toUpperCase() === "G",
        });
      }
      rows.sort((a, b) => Number(b.goalie) - Number(a.goalie)); // guarda-redes primeiro
      out[name] = rows.slice(0, MAX_INJURIES_PER_TEAM).map((r) => r.text);
    }

    if (Object.keys(out).length === 0) return null;
    await redis.setPx(INJURY_CACHE_KEY, JSON.stringify(out), INJURY_CACHE_TTL_MS);
    return new Map(Object.entries(out));
  } catch (e) {
    console.error("[gemini] lesões (ESPN) falhou:", e);
    return null;
  }
}

function injuriesFor(map: InjuryMap | null, fullName: string): string[] {
  if (!map) return ["Sem dados de lesões (fonte indisponível)"];
  const n = normName(fullName);
  const exact = map.get(n);
  if (exact) return exact;
  // Fallback: mesma última palavra do nome (ex.: "Wings", "Leafs"), só se for inequívoco.
  const last = n.split(" ").pop();
  const hits = [...map.entries()].filter(([k]) => k.split(" ").pop() === last);
  return hits.length === 1 ? hits[0][1] : [];
}

function withInjuries(predictions: Prediction[], map: InjuryMap | null): Prediction[] {
  return predictions.map((p) => ({
    ...p,
    injuries: { home: injuriesFor(map, p.homeTeam), away: injuriesFor(map, p.awayTeam) },
  }));
}

// ─── Resumos (Groq, opcional) ────────────────────────────────────────────────

const f1 = (n: number) => n.toFixed(1);
const pct = (x: number) => Math.round(x * 100);

function describeTeam(label: string, t?: TeamRecent) {
  if (!t || t.gp === 0) return `${label}: sem jogos nos últimos ${WINDOW_DAYS} dias.`;
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

function fallbackSummary(g: NhlGame, e: Expected, p: Prediction, home?: TeamRecent, away?: TeamRecent) {
  const homeFav = p.winProbabilityHome >= 50;
  const fav = homeFav ? g.homeAbbr : g.awayAbbr;
  const favP = homeFav ? p.winProbabilityHome : p.winProbabilityAway;
  if ((home?.gp ?? 0) + (away?.gp ?? 0) === 0) {
    return `Sem jogos recentes de ${g.homeAbbr} e ${g.awayAbbr}: estimativa pelas médias da liga e vantagem de jogar em casa (${fav} ${favP}%).`;
  }
  return (
    `${fav} favorito (${favP}%). Golos esperados: ${g.homeAbbr} ${f1(e.lh)}, ${g.awayAbbr} ${f1(e.la)} ` +
    `(total ${f1(e.lh + e.la)}). Base: ${home?.gp ?? 0} jogo(s) de ${g.homeAbbr} e ${away?.gp ?? 0} de ${g.awayAbbr} nos últimos ${WINDOW_DAYS} dias.`
  );
}

function buildSummaryPrompt(
  date: string,
  from: string,
  to: string,
  games: NhlGame[],
  predictions: Prediction[],
  expected: Map<string, Expected>,
  form: Map<string, TeamRecent>,
  inj: InjuryMap | null
) {
  const injLine = (name: string) => {
    if (!inj) return "";
    const list = injuriesFor(inj, name);
    return list.length ? `\n    Lesões (ESPN): ${list.join("; ")}` : "";
  };

  const block = games
    .map((g, i) => {
      const p = predictions[i];
      const e = expected.get(p.id)!;
      return [
        `id=${g.id} | ${g.homeAbbr} (casa) vs ${g.awayAbbr} (fora)`,
        `  Modelo: vitória casa ${p.winProbabilityHome}% / fora ${p.winProbabilityAway}%; empate aos 60 min ${p.drawTRProb}%; 2+ golos no 1.º período ${p.over15P1Prob}%; ambas marcam no 1.º período ${p.bttsP1Prob}%; 5+ golos ${p.over45Prob}%; 6+ golos ${p.over55Prob}%; golos esperados ${g.homeAbbr} ${f1(e.lh)} / ${g.awayAbbr} ${f1(e.la)}`,
        `  ${describeTeam(`CASA ${g.homeAbbr}`, form.get(g.homeAbbr))}${injLine(g.homeName)}`,
        `  ${describeTeam(`FORA ${g.awayAbbr}`, form.get(g.awayAbbr))}${injLine(g.awayName)}`,
      ].join("\n");
    })
    .join("\n");

  return `És o redator do NHL Tipsterz. Os números de cada jogo (${date}) já foram calculados por um modelo estatístico com a forma de ${from} a ${to}. NÃO alteres nem recalcules percentagens.

A tua tarefa: para cada jogo, escrever "analysisSummary" com 1 a 2 frases diretas em português de Portugal:
- diz quem é o favorito e o que o justifica, usando só os números fornecidos (golos marcados/sofridos, forma, golos esperados);
- se houver lesões de guarda-redes listadas (fonte ESPN, podem estar desatualizadas), refere-as;
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

function buildPredictions(games: NhlGame[], form: Map<string, TeamRecent>, ctx: LeagueCtx) {
  const expected = new Map<string, Expected>();

  const predictions: Prediction[] = games.map((g) => {
    const home = form.get(g.homeAbbr);
    const away = form.get(g.awayAbbr);
    const m = gameModel(home, away, ctx);
    const winHome = pct(m.pHome);

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
      winProbabilityAway: 100 - winHome,
      over15P1Prob: pct(m.over15P1),
      bttsP1Prob: pct(m.btts),
      drawTRProb: pct(m.tie),
      over45Prob: pct(m.over45),
      over55Prob: pct(m.over55),
      analysisSummary: "",
      injuries: { home: [], away: [] },
    };
    const e = { lh: m.lh, la: m.la };
    expected.set(p.id, e);
    p.analysisSummary = fallbackSummary(g, e, p, home, away);
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

    // Lesões (cache curta própria, para não ficarem presas nas 8h da cache da análise)
    const injuries = await fetchInjuries();
    const injMeta = { source: injuries ? ("espn" as const) : ("unavailable" as const), teams: injuries?.size ?? 0 };

    if (!force) {
      const cached = await readCache(date);
      if (cached) {
        return json({
          ...cached,
          predictions: withInjuries(cached.predictions, injuries),
          meta: { ...cached.meta, injuries: injMeta, cached: true },
        });
      }
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

    // Forma dos últimos 7 dias
    const from = addDays(date, -WINDOW_DAYS);
    const to = addDays(date, -1);
    const { games: recent, failedDays } = await fetchFinishedGames(date);
    await enrichFirstPeriod(recent);
    const form = aggregateTeams(recent);
    const ctx = buildLeagueCtx(leagueRates(recent));
    const preseasonGames = recent.filter((g) => g.gameType === 1).length;

    // Probabilidades: modelo estatístico (não dependem da IA)
    const { predictions: modelPreds, expected } = buildPredictions(games, form, ctx);

    // Resumos: IA (opcional). Se falhar, ficam os resumos automáticos.
    let aiError: string | null = null;
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      aiError = "GROQ_API_KEY não configurada na Vercel.";
    } else {
      try {
        const summaries = await askGroqSummaries(
          apiKey,
          buildSummaryPrompt(date, from, to, games, modelPreds, expected, form, injuries)
        );
        for (const p of modelPreds) {
          const text = summaries.get(p.id);
          if (text) p.analysisSummary = text;
        }
      } catch (e: any) {
        aiError = e?.message || "Erro na IA.";
        console.error("[gemini] Groq falhou:", aiError);
      }
    }

    const predictions = withInjuries(modelPreds, injuries);

    const notes: string[] = [];
    if (aiError) notes.push(`Resumos automáticos (IA indisponível: ${aiError}).`);
    if (!injuries) notes.push("Lesões indisponíveis (fonte ESPN sem resposta ou com formato inesperado).");
    if (failedDays > 0) notes.push(`Falhou a leitura de ${failedDays} dia(s) da janela de 7 dias.`);

    const payload: AnalysisPayload = {
      predictions,
      lastUpdated: new Date().toISOString(),
      meta: {
        source: "model",
        games: predictions.length,
        window: { from, to, gamesUsed: recent.length, preseasonGames },
        injuries: injMeta,
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