// api/players.ts
// Jogadores com mais probabilidade de MARCAR e de PONTUAR (golo ou assistência) em cada jogo.
//
// Para cada equipa: escolhe os melhores candidatos (histórico da época atual + passada), vai buscar os últimos
// 10 jogos de cada um, e calcula a probabilidade a partir de
//   • quantos desses 10 jogos marcou / pontuou (peso maior),
//   • o rendimento da época (peso menor, "puxa" a amostra pequena para a média do jogador),
//   • os golos esperados da equipa neste jogo (adversário e vantagem de casa).
// Jogadores lesionados (Out / IR) ficam de fora; "day-to-day" tem a probabilidade reduzida.

import { redis } from "./_redis.js";

export const config = { runtime: "edge" };

const NHL_API = "https://api-web.nhle.com/v1";
const STATS_REST = "https://api.nhle.com/stats/rest/en";

const GAMES_PER_PLAYER = 10;
const POOL_PER_TEAM = 8; // candidatos por equipa
const PICKS_PER_LIST = 4; // mostrados em "marcar" e em "pontuar"
const MAX_GAMES = 16;
const MAX_PLAYERS = 140;
const BATCH = 14;

const CFG = {
  prevSeasonWeight: 0.6, // peso da época passada no histórico de época
  seasonShrinkGames: 10, // jogos "virtuais" de média de liga no rendimento de época
  base: { F: { gpg: 0.25, ppg: 0.55 }, D: { gpg: 0.08, ppg: 0.3 } },
  priorGames: 8, // peso (em jogos) do rendimento de época contra os últimos 10 jogos
  refTeamGoals: 3.05, // golos esperados de uma equipa num jogo médio
  ratioMin: 0.75,
  ratioMax: 1.35,
  dtdFactor: 0.5, // "day-to-day": probabilidade reduzida a metade
  cap: { goal: 0.7, point: 0.92 },
} as const;

// ─── Tipos ───────────────────────────────────────────────────────────────────

type GameReq = {
  id: string | number;
  homeAbbr: string;
  awayAbbr: string;
  homeName: string;
  awayName: string;
  expHome?: number; // golos esperados da equipa da casa neste jogo
  expAway?: number;
};

type SeasonRow = { id: number; name: string; pos: string; gp: number; g: number; pts: number };
type RosterPlayer = { id: number; name: string; pos: string };
type LogRow = { d: string; o: string; h: number; g: number; a: number; prev?: number };

type PlayerCard = {
  id: number;
  name: string;
  pos: string;
  probGoal: number; // %
  probPoint: number; // %
  n: number; // jogos considerados (até 10)
  goalGames: number; // jogos em que marcou
  pointGames: number; // jogos em que pontuou
  goalStreak: number; // jogos seguidos a marcar (até ao último jogo)
  pointStreak: number;
  last3Goals: number; // jogos com golo nos últimos 3
  last3Points: number;
  status?: "DTD";
  log: { d: string; o: string; h: number; g: number; a: number; prev?: number }[]; // mais recente primeiro
};

type TeamPlayers = { abbr: string; scorers: PlayerCard[]; pointers: PlayerCard[]; candidates: number };

// ─── Utilitários ─────────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const num = (x: unknown, fallback = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
};

const normName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

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

// ─── Dados da NHL ────────────────────────────────────────────────────────────

async function fetchSeasonRows(season: string): Promise<Map<number, SeasonRow> | null> {
  const key = `nhl:players:v2:${season}`;
  const cached = await redis.get(key);
  if (cached) {
    try {
      return new Map((JSON.parse(cached) as SeasonRow[]).map((p) => [p.id, p]));
    } catch {
      /* ignora cache inválida */
    }
  }
  try {
    const q = encodeURIComponent(`seasonId=${season} and gameTypeId=2`);
    const res = await fetchWithTimeout(`${STATS_REST}/skater/summary?limit=-1&cayenneExp=${q}`, {}, 15000);
    if (!res.ok) return null;
    const data = await res.json();
    const rows: SeasonRow[] = [];
    for (const r of Array.isArray(data?.data) ? data.data : []) {
      const id = num(r?.playerId);
      if (!id) continue;
      rows.push({
        id,
        name: String(r?.skaterFullName ?? ""),
        pos: String(r?.positionCode ?? ""),
        gp: num(r?.gamesPlayed),
        g: num(r?.goals),
        pts: num(r?.points),
      });
    }
    await redis.setPx(key, JSON.stringify(rows), rows.length ? 12 * 60 * 60 * 1000 : 60 * 60 * 1000);
    return new Map(rows.map((p) => [p.id, p]));
  } catch (e) {
    console.error(`[players] estatísticas ${season} falharam:`, e);
    return null;
  }
}

async function fetchRoster(abbr: string): Promise<RosterPlayer[] | null> {
  const key = `nhl:roster:v1:${abbr}`; // mesma chave e formato usados em /api/gemini
  const cached = await redis.get(key);
  if (cached) {
    try {
      return JSON.parse(cached) as RosterPlayer[];
    } catch {
      /* ignora cache inválida */
    }
  }
  try {
    const res = await fetchWithTimeout(`${NHL_API}/roster/${abbr}/current`, {}, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    const out: RosterPlayer[] = [];
    for (const [group, pos] of [["forwards", "F"], ["defensemen", "D"], ["goalies", "G"]] as const) {
      for (const p of Array.isArray(data?.[group]) ? data[group] : []) {
        const id = num(p?.id);
        if (!id) continue;
        const name = `${p?.firstName?.default ?? ""} ${p?.lastName?.default ?? ""}`.trim();
        out.push({ id, name, pos: group === "forwards" ? String(p?.positionCode ?? pos) : pos });
      }
    }
    if (out.length === 0) return null;
    await redis.setPx(key, JSON.stringify(out), 6 * 60 * 60 * 1000);
    return out;
  } catch {
    return null;
  }
}

async function fetchLog(id: number, season: string, ttlMs: number): Promise<LogRow[] | null> {
  const key = `nhl:glog:v1:${id}:${season}`;
  const cached = await redis.get(key);
  if (cached) {
    try {
      return JSON.parse(cached) as LogRow[];
    } catch {
      /* ignora cache inválida */
    }
  }
  try {
    const res = await fetchWithTimeout(`${NHL_API}/player/${id}/game-log/${season}/2`, {}, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    const rows: LogRow[] = (Array.isArray(data?.gameLog) ? data.gameLog : [])
      .map((r: any) => ({
        d: String(r?.gameDate ?? ""),
        o: String(r?.opponentAbbrev ?? ""),
        h: r?.homeRoadFlag === "H" ? 1 : 0,
        g: num(r?.goals),
        a: num(r?.assists),
      }))
      .filter((r: LogRow) => r.d)
      .sort((x: LogRow, y: LogRow) => y.d.localeCompare(x.d));
    await redis.setPx(key, JSON.stringify(rows), ttlMs);
    return rows;
  } catch {
    return null;
  }
}

// Lesões (ESPN): lê a cache que o /api/gemini já mantém; se não existir, vai buscar.
type InjuryEntry = { name: string; status: string };

async function fetchInjuryMap(): Promise<Map<string, InjuryEntry[]> | null> {
  const cached = await redis.get("nhl:injuries:v2");
  if (cached) {
    try {
      return new Map(Object.entries(JSON.parse(cached) as Record<string, InjuryEntry[]>));
    } catch {
      /* continua */
    }
  }
  try {
    const res = await fetchWithTimeout("https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries", {}, 6000);
    if (!res.ok) return null;
    const data = await res.json();
    const out = new Map<string, InjuryEntry[]>();
    for (const t of Array.isArray(data?.injuries) ? data.injuries : []) {
      const name = normName(String(t?.displayName ?? t?.team?.displayName ?? ""));
      if (!name) continue;
      out.set(
        name,
        (Array.isArray(t?.injuries) ? t.injuries : []).map((i: any) => ({
          name: String(i?.athlete?.displayName ?? i?.athlete?.fullName ?? ""),
          status: String(i?.status ?? i?.type?.description ?? ""),
        }))
      );
    }
    return out.size ? out : null;
  } catch {
    return null;
  }
}

function unavailability(status: string): number {
  const s = status.toLowerCase();
  if (/\bout\b|injured reserve|\bir\b|ltir|suspen/.test(s)) return 1;
  if (/doubtful/.test(s)) return 0.75;
  return 0.5;
}

/** nome normalizado do jogador → indisponibilidade (0.5 = day-to-day, 1 = fora) */
function injuredOf(map: Map<string, InjuryEntry[]> | null, teamFullName: string): Map<string, number> {
  const out = new Map<string, number>();
  if (!map) return out;
  const n = normName(teamFullName);
  let entries = map.get(n);
  if (!entries) {
    const last = n.split(" ").pop();
    const hits = [...map.entries()].filter(([k]) => k.split(" ").pop() === last);
    entries = hits.length === 1 ? hits[0][1] : [];
  }
  for (const e of entries) {
    if (e.name) out.set(normName(e.name), Math.max(out.get(normName(e.name)) ?? 0, unavailability(e.status)));
  }
  return out;
}

// ─── Modelo ──────────────────────────────────────────────────────────────────

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function seasonPrior(p: RosterPlayer, cur?: SeasonRow, prev?: SeasonRow) {
  const C = CFG;
  const w = C.prevSeasonWeight;
  const gp = (cur?.gp ?? 0) + w * (prev?.gp ?? 0);
  const g = (cur?.g ?? 0) + w * (prev?.g ?? 0);
  const pts = (cur?.pts ?? 0) + w * (prev?.pts ?? 0);
  const base = p.pos === "D" ? C.base.D : C.base.F;
  const k = C.seasonShrinkGames;
  return {
    gpg: (g + base.gpg * k) / (gp + k),
    ppg: (pts + base.ppg * k) / (gp + k),
  };
}

function mergedHistory(curLog: LogRow[] | null, prevLog: LogRow[] | null): LogRow[] {
  const cur = curLog ?? [];
  if (cur.length >= GAMES_PER_PLAYER || !prevLog) return cur.slice(0, GAMES_PER_PLAYER);
  const need = GAMES_PER_PLAYER - cur.length;
  return [...cur, ...prevLog.slice(0, need).map((r) => ({ ...r, prev: 1 }))];
}

function buildCard(
  p: RosterPlayer,
  hist: LogRow[],
  prior: { gpg: number; ppg: number },
  teamExp: number,
  unavail: number
): PlayerCard | null {
  const C = CFG;
  const n = hist.length;
  if (n < 3) return null; // sem histórico suficiente

  const goalGames = hist.filter((r) => r.g > 0).length;
  const pointGames = hist.filter((r) => r.g + r.a > 0).length;

  const priorGoal = 1 - Math.exp(-prior.gpg);
  const priorPoint = 1 - Math.exp(-prior.ppg);
  const k = C.priorGames;
  const pG = (goalGames + k * priorGoal) / (n + k);
  const pP = (pointGames + k * priorPoint) / (n + k);

  // Ajuste ao jogo de hoje: equipa com mais golos esperados → mais hipóteses para os seus jogadores
  const ratio = clamp(teamExp / C.refTeamGoals, C.ratioMin, C.ratioMax);
  const adj = (p0: number) => 1 - Math.pow(1 - p0, ratio);

  const availability = unavail >= 1 ? 0 : unavail > 0 ? C.dtdFactor : 1;
  const probGoal = Math.round(clamp(adj(pG), 0, C.cap.goal) * availability * 100);
  const probPoint = Math.round(clamp(adj(pP), 0, C.cap.point) * availability * 100);

  const streak = (hit: (r: LogRow) => boolean) => {
    let s = 0;
    for (const r of hist) {
      if (!hit(r)) break;
      s++;
    }
    return s;
  };
  const last3 = hist.slice(0, 3);

  return {
    id: p.id,
    name: p.name,
    pos: p.pos,
    probGoal,
    probPoint,
    n,
    goalGames,
    pointGames,
    goalStreak: streak((r) => r.g > 0),
    pointStreak: streak((r) => r.g + r.a > 0),
    last3Goals: last3.filter((r) => r.g > 0).length,
    last3Points: last3.filter((r) => r.g + r.a > 0).length,
    ...(unavail > 0 && unavail < 1 ? { status: "DTD" as const } : {}),
    log: hist.map((r) => ({ d: r.d, o: r.o, h: r.h, g: r.g, a: r.a, ...(r.prev ? { prev: 1 } : {}) })),
  };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const date = String(body?.date ?? "").trim();
    const games: GameReq[] = Array.isArray(body?.games) ? body.games.slice(0, MAX_GAMES) : [];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ message: "Data inválida (usa YYYY-MM-DD)." }, 400);
    if (games.length === 0) return json({ games: [], meta: { players: 0 } });

    const season = seasonIdFor(date);
    const prevSeason = prevSeasonId(season);
    const abbrs = [...new Set(games.flatMap((g) => [g.homeAbbr, g.awayAbbr]))].filter(Boolean);

    const [cur, prev, injuries, rosterList] = await Promise.all([
      fetchSeasonRows(season),
      fetchSeasonRows(prevSeason),
      fetchInjuryMap(),
      Promise.all(abbrs.map(async (a) => [a, await fetchRoster(a)] as const)),
    ]);
    const rosters = new Map(rosterList.filter(([, r]) => r).map(([a, r]) => [a, r as RosterPlayer[]]));

    if (!cur && !prev) return json({ message: "Estatísticas de jogadores indisponíveis na NHL." }, 502);
    if (rosters.size === 0) return json({ message: "Plantéis indisponíveis na NHL." }, 502);

    // 1) candidatos por equipa
    type Cand = { p: RosterPlayer; prior: { gpg: number; ppg: number }; unavail: number };
    const pools = new Map<string, Cand[]>();
    for (const g of games) {
      for (const [abbr, name] of [[g.homeAbbr, g.homeName], [g.awayAbbr, g.awayName]] as const) {
        const roster = rosters.get(abbr);
        if (!roster || pools.has(abbr)) continue;
        const inj = injuredOf(injuries, name);
        const cands: Cand[] = roster
          .filter((p) => p.pos !== "G")
          .map((p) => ({
            p,
            prior: seasonPrior(p, cur?.get(p.id), prev?.get(p.id)),
            unavail: inj.get(normName(p.name)) ?? 0,
          }))
          .filter((c) => c.unavail < 1)
          .sort((a, b) => b.prior.ppg - a.prior.ppg)
          .slice(0, POOL_PER_TEAM);
        pools.set(abbr, cands);
      }
    }

    // 2) últimos jogos de cada candidato (época atual; época passada só se faltar histórico)
    const ids = [...new Set([...pools.values()].flatMap((c) => c.map((x) => x.p.id)))].slice(0, MAX_PLAYERS);
    const curLogs = new Map<number, LogRow[] | null>();
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const res = await Promise.all(batch.map((id) => fetchLog(id, season, 3 * 60 * 60 * 1000)));
      batch.forEach((id, j) => curLogs.set(id, res[j]));
    }
    const needPrev = ids.filter((id) => (curLogs.get(id)?.length ?? 0) < GAMES_PER_PLAYER);
    const prevLogs = new Map<number, LogRow[] | null>();
    for (let i = 0; i < needPrev.length; i += BATCH) {
      const batch = needPrev.slice(i, i + BATCH);
      const res = await Promise.all(batch.map((id) => fetchLog(id, prevSeason, 24 * 60 * 60 * 1000)));
      batch.forEach((id, j) => prevLogs.set(id, res[j]));
    }

    // 3) probabilidades e escolha dos melhores por equipa
    const teamResult = (abbr: string, teamExp: number): TeamPlayers => {
      const cards: PlayerCard[] = [];
      for (const c of pools.get(abbr) ?? []) {
        const hist = mergedHistory(curLogs.get(c.p.id) ?? null, prevLogs.get(c.p.id) ?? null);
        const card = buildCard(c.p, hist, c.prior, teamExp, c.unavail);
        if (card) cards.push(card);
      }
      return {
        abbr,
        candidates: cards.length,
        scorers: [...cards].sort((a, b) => b.probGoal - a.probGoal).slice(0, PICKS_PER_LIST),
        pointers: [...cards].sort((a, b) => b.probPoint - a.probPoint).slice(0, PICKS_PER_LIST),
      };
    };

    const out = games.map((g) => ({
      id: g.id,
      home: teamResult(g.homeAbbr, num(g.expHome, CFG.refTeamGoals)),
      away: teamResult(g.awayAbbr, num(g.expAway, CFG.refTeamGoals)),
    }));

    return json({
      games: out,
      meta: {
        players: ids.length,
        injuries: injuries ? "espn" : "unavailable",
        note: "Probabilidade a partir dos últimos 10 jogos de cada jogador, ajustada à época e ao jogo de hoje.",
      },
    });
  } catch (e: any) {
    return json({ message: e?.message || "Erro interno no servidor." }, 500);
  }
}
