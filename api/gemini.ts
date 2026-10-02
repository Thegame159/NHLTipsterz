// api/gemini.ts
// Fluxo: calendário (NHL) + resultados dos ÚLTIMOS 7 DIAS (NHL) → Groq (probabilidades + texto) → cache em Redis.
//
// Janela de forma: os 7 dias de calendário anteriores à data analisada, haja ou não jogos de cada equipa.
// - Nos primeiros dias da época regular, a janela apanha jogos de pré-época (que contam, com menos peso).
// - No 8.º dia da época regular a janela (dias 1 a 7) já só tem jogos da época regular, por construção.

import { redis } from "./_redis.js";

export const config = { runtime: "edge" };

const NHL_API = "https://api-web.nhle.com/v1";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const WINDOW_DAYS = 7;
const CACHE_PREFIX = "nhl:analysis:v2:";
const CACHE_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas
const GAME_CACHE_PREFIX = "nhl:game:v1:"; // golos do 1.º período de jogos já terminados (nunca mudam)
const GAME_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ESPN_INJURIES_URL = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries";
const INJURY_CACHE_KEY = "nhl:injuries:v1";
const INJURY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos
const MAX_INJURIES_PER_TEAM = 8;
const MAX_PBP_FETCHES = 80;
const PBP_BATCH = 10;

// Médias de referência, usadas quando a janela tem poucos jogos para calcular as da liga.
const LEAGUE_DEFAULTS = { homeWin: 54, regTie: 23, p1Over15: 55, p1Btts: 30, over45: 68, over55: 50 };

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
  regGoalsAvg: number;
  homeWin: number;
  regTie: number;
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
    source: "ai" | "baseline";
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

const clampPct = (x: unknown, fallback: number) => {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(99, Math.max(1, Math.round(n)));
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
      t = { abbr, gp: 0, preGp: 0, w: 0, l: 0, otl: 0, gf: 0, ga: 0, over45: 0, over55: 0, regTies: 0, p1n: 0, p1Over15: 0, p1Btts: 0, p1For: 0, p1Against: 0 };
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
  const n = games.length;
  const p1 = games.filter((g) => g.p1Home != null && g.p1Away != null);
  const pct = (count: number, of: number, fallback: number) => (of >= 8 ? Math.round((count / of) * 100) : fallback);

  return {
    games: n,
    p1Games: p1.length,
    regGoalsAvg: n > 0 ? games.reduce((s, g) => s + regTotal(g), 0) / n : 0,
    homeWin: pct(games.filter((g) => g.homeScore > g.awayScore).length, n, LEAGUE_DEFAULTS.homeWin),
    regTie: pct(games.filter((g) => g.ending === "OT" || g.ending === "SO").length, n, LEAGUE_DEFAULTS.regTie),
    p1Over15: pct(p1.filter((g) => g.p1Home! + g.p1Away! >= 2).length, p1.length, LEAGUE_DEFAULTS.p1Over15),
    p1Btts: pct(p1.filter((g) => g.p1Home! > 0 && g.p1Away! > 0).length, p1.length, LEAGUE_DEFAULTS.p1Btts),
    over45: pct(games.filter((g) => regTotal(g) >= 5).length, n, LEAGUE_DEFAULTS.over45),
    over55: pct(games.filter((g) => regTotal(g) >= 6).length, n, LEAGUE_DEFAULTS.over55),
  };
}

// ─── Probabilidades base (se a IA falhar ou não devolver um jogo) ────────────

function baseline(home: TeamRecent | undefined, away: TeamRecent | undefined, lg: LeagueRates) {
  const gd = (t?: TeamRecent) => (t && t.gp > 0 ? (t.gf - t.ga) / t.gp : 0);
  const winHome = Math.min(70, Math.max(35, Math.round(lg.homeWin + (gd(home) - gd(away)) * 3)));
  return {
    winProbabilityHome: winHome,
    over15P1Prob: lg.p1Over15,
    bttsP1Prob: lg.p1Btts,
    drawTRProb: lg.regTie,
    over45Prob: lg.over45,
    over55Prob: lg.over55,
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

// ─── Groq ────────────────────────────────────────────────────────────────────

const f1 = (n: number) => n.toFixed(1);

function describeTeam(label: string, t?: TeamRecent) {
  if (!t || t.gp === 0) {
    return `${label}: sem jogos nos últimos ${WINDOW_DAYS} dias — usa as médias da liga, com pequeno ajuste pela vantagem de casa.`;
  }
  let s =
    `${label}: ${t.gp} jogo(s) em ${WINDOW_DAYS} dias` +
    (t.preGp > 0 ? ` (${t.preGp} de pré-época)` : "") +
    `, V-D-DP ${t.w}-${t.l}-${t.otl}, golos ${f1(t.gf / t.gp)} marcados / ${f1(t.ga / t.gp)} sofridos por jogo` +
    `, 5+ golos em ${t.over45}/${t.gp}, 6+ em ${t.over55}/${t.gp}, empates no tempo regulamentar ${t.regTies}/${t.gp}`;
  if (t.p1n > 0) {
    s +=
      `, 2+ golos no 1.º período em ${t.p1Over15}/${t.p1n}, ambas marcam no 1.º período em ${t.p1Btts}/${t.p1n}` +
      `, golos no 1.º período ${f1(t.p1For / t.p1n)} marcados / ${f1(t.p1Against / t.p1n)} sofridos`;
  }
  return s;
}

function buildPrompt(
  date: string,
  from: string,
  to: string,
  games: NhlGame[],
  form: Map<string, TeamRecent>,
  lg: LeagueRates,
  inj: InjuryMap | null
) {
  const injLine = (name: string) => {
    if (!inj) return "";
    const list = injuriesFor(inj, name);
    return list.length ? `\n    Lesões (ESPN): ${list.join("; ")}` : "";
  };
  const block = games
    .map((g) => {
      const tag = g.gameType === 1 ? " [PRÉ-ÉPOCA]" : g.gameType === 3 ? " [PLAYOFFS]" : "";
      return [
        `id=${g.id}${tag} | ${g.homeAbbr} (casa) vs ${g.awayAbbr} (fora) | ${g.startTimeUTC}`,
        `  ${describeTeam(`CASA ${g.homeAbbr}`, form.get(g.homeAbbr))}${injLine(g.homeName)}`,
        `  ${describeTeam(`FORA ${g.awayAbbr}`, form.get(g.awayAbbr))}${injLine(g.awayName)}`,
      ].join("\n");
    })
    .join("\n");

  const league =
    lg.games >= 8
      ? `Na janela (${lg.games} jogos terminados): ${f1(lg.regGoalsAvg)} golos por jogo em tempo regulamentar; casa venceu ${lg.homeWin}%; empate no tempo regulamentar ${lg.regTie}%; 5+ golos ${lg.over45}%; 6+ golos ${lg.over55}%; ` +
        (lg.p1Games > 0 ? `2+ golos no 1.º período ${lg.p1Over15}%; ambas marcam no 1.º período ${lg.p1Btts}% (${lg.p1Games} jogos com dados do 1.º período).` : `sem dados do 1.º período.`)
      : `Poucos jogos terminados na janela (${lg.games}) para calcular médias fiáveis. Referências típicas da liga: casa vence ~${LEAGUE_DEFAULTS.homeWin}%; empate no tempo regulamentar ~${LEAGUE_DEFAULTS.regTie}%; 2+ golos no 1.º período ~${LEAGUE_DEFAULTS.p1Over15}%; ambas marcam no 1.º período ~${LEAGUE_DEFAULTS.p1Btts}%; 5+ golos ~${LEAGUE_DEFAULTS.over45}%; 6+ golos ~${LEAGUE_DEFAULTS.over55}%.`;

  return `És o motor estatístico do NHL Tipsterz. Estima probabilidades para os jogos da NHL de ${date}, com base APENAS na forma dos últimos ${WINDOW_DAYS} dias (de ${from} a ${to}).

REGRAS:
- Usa só os dados fornecidos. Não inventes lesões, alinhamentos, guarda-redes nem resultados. Se houver lesões listadas (fonte ESPN, podem estar desatualizadas), podes referi-las, sobretudo as de guarda-redes; não acrescentes outras.
- As amostras são pequenas (muitas equipas têm 0 a 4 jogos na janela). Quanto menos jogos, mais perto das médias da liga deves ficar; só te afastes bastante delas com sinais consistentes.
- Jogos de pré-época contam, mas com menos peso do que jogos de época regular (alinhamentos experimentais).
- Equipas sem jogos na janela: usa as médias da liga, com vantagem de casa.
- Valores inteiros de 1 a 99 (percentagens).
- analysisSummary: 1 a 2 frases em português de Portugal, baseadas só nos números fornecidos, a dizer o que pesou na estimativa (inclui referir quando a amostra é pequena).

MÉDIAS DA LIGA:
${league}

CAMPOS (por jogo):
- winProbabilityHome: probabilidade de a equipa da casa vencer (inclui prolongamento/desempate).
- over15P1Prob: probabilidade de haver 2 ou mais golos no 1.º período.
- bttsP1Prob: probabilidade de ambas as equipas marcarem no 1.º período.
- drawTRProb: probabilidade de empate no tempo regulamentar (60 min).
- over45Prob: probabilidade de 5 ou mais golos no jogo (tempo regulamentar).
- over55Prob: probabilidade de 6 ou mais golos no jogo (tempo regulamentar).

JOGOS:
${block}

Responde EXCLUSIVAMENTE com JSON neste formato, com um objeto por jogo e o "id" exatamente como indicado:
{"games":[{"id":"...","winProbabilityHome":0,"over15P1Prob":0,"bttsP1Prob":0,"drawTRProb":0,"over45Prob":0,"over55Prob":0,"analysisSummary":"..."}]}`;
}

async function askGroq(apiKey: string, prompt: string): Promise<any[]> {
  const res = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_completion_tokens: 8000,
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
  if (Array.isArray(parsed?.games)) return parsed.games;
  if (Array.isArray(parsed?.predictions)) return parsed.predictions;
  throw new Error("Resposta da IA sem lista de jogos.");
}

// ─── Montagem das previsões ──────────────────────────────────────────────────

const record = (t?: TeamRecent) => (t ? `${t.w}-${t.l}-${t.otl}` : "0-0-0");

function buildPredictions(games: NhlGame[], form: Map<string, TeamRecent>, lg: LeagueRates, ai: any[] | null) {
  const byId = new Map<string, any>();
  for (const item of ai ?? []) if (item?.id != null) byId.set(String(item.id), item);

  let aiCount = 0;

  const predictions: Prediction[] = games.map((g) => {
    const home = form.get(g.homeAbbr);
    const away = form.get(g.awayAbbr);
    const base = baseline(home, away, lg);
    const a = byId.get(String(g.id));
    if (a) aiCount++;

    const winHome = clampPct(a?.winProbabilityHome, base.winProbabilityHome);

    return {
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
      over15P1Prob: clampPct(a?.over15P1Prob, base.over15P1Prob),
      bttsP1Prob: clampPct(a?.bttsP1Prob, base.bttsP1Prob),
      drawTRProb: clampPct(a?.drawTRProb, base.drawTRProb),
      over45Prob: clampPct(a?.over45Prob, base.over45Prob),
      over55Prob: clampPct(a?.over55Prob, base.over55Prob),
      analysisSummary:
        typeof a?.analysisSummary === "string" && a.analysisSummary.trim()
          ? a.analysisSummary.trim()
          : "Estimativa base a partir da forma dos últimos 7 dias (sem análise de IA para este jogo).",
      injuries: { home: [], away: [] },
    };
  });

  return { predictions, aiCount };
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
        meta: { source: "baseline", games: 0, note: "Sem jogos da NHL nesta data." },
      });
    }

    // Forma dos últimos 7 dias
    const from = addDays(date, -WINDOW_DAYS);
    const to = addDays(date, -1);
    const { games: recent, failedDays } = await fetchFinishedGames(date);
    await enrichFirstPeriod(recent);
    const form = aggregateTeams(recent);
    const lg = leagueRates(recent);
    const preseasonGames = recent.filter((g) => g.gameType === 1).length;

    // IA
    let ai: any[] | null = null;
    let aiError: string | null = null;
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      aiError = "GROQ_API_KEY não configurada na Vercel.";
    } else {
      try {
        ai = await askGroq(apiKey, buildPrompt(date, from, to, games, form, lg, injuries));
      } catch (e: any) {
        aiError = e?.message || "Erro na IA.";
        console.error("[gemini] Groq falhou:", aiError);
      }
    }

    const built = buildPredictions(games, form, lg, ai);
    const aiCount = built.aiCount;
    const predictions = withInjuries(built.predictions, injuries);
    const usedAi = aiCount > 0;

    const notes: string[] = [];
    if (aiError) notes.push(`IA indisponível (${aiError}). A mostrar estimativas base.`);
    if (!injuries) notes.push("Lesões indisponíveis (fonte ESPN sem resposta ou com formato inesperado).");
    if (failedDays > 0) notes.push(`Falhou a leitura de ${failedDays} dia(s) da janela de 7 dias.`);

    const payload: AnalysisPayload = {
      predictions,
      lastUpdated: new Date().toISOString(),
      meta: {
        source: usedAi ? "ai" : "baseline",
        games: predictions.length,
        window: { from, to, gamesUsed: recent.length, preseasonGames },
        injuries: injMeta,
        ...(notes.length ? { note: notes.join(" ") } : {}),
      },
    };

    // Só guardamos em cache resultados completos com IA e sem falhas de leitura.
    if (usedAi && aiCount === games.length && failedDays === 0) {
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