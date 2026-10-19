// api/players.ts
// Aba "Jogadores": por equipa, os jogadores do PLANTEL ATUAL com mais pontos / golos / assistências
// (estatísticas da época; no arranque da época completa com a época passada), com a probabilidade de hoje
// de marcar / assistir / pontuar e os últimos 10 jogos de cada um. Lesionados aparecem sempre assinalados.
//
// Plantel: /roster/{equipa}/current → /roster/{equipa}/{época} → /club-stats/{equipa}/now → estatísticas da liga.

import { redis } from "./_redis.js";

export const config = { runtime: "edge" };

const NHL_API = "https://api-web.nhle.com/v1";
const STATS_REST = "https://api.nhle.com/stats/rest/en";

const GAMES_PER_PLAYER = 10;
const POOL_PER_TEAM = 10; // jogadores por equipa
const MIN_SEASON_GAMES = 10; // abaixo disto (início de época) mostra-se a época passada
const MAX_GAMES = 16;
const MAX_PLAYERS = 340;
const BATCH = 24;

const CFG = {
  prevSeasonWeight: 0.6, // peso da época passada no histórico de época
  seasonShrinkGames: 10, // jogos "virtuais" de média de liga no rendimento de época
  base: { F: { gpg: 0.25, ppg: 0.55 }, D: { gpg: 0.08, ppg: 0.3 } },
  priorGames: 8, // peso (em jogos) do rendimento de época contra os últimos 10 jogos
  refTeamGoals: 3.05, // golos esperados de uma equipa num jogo médio
  ratioMin: 0.75,
  ratioMax: 1.35,
  dtdFactor: 0.5, // "day-to-day": probabilidade reduzida a metade
  cap: { goal: 0.7, assist: 0.8, point: 0.92 },
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

type SeasonRow = { id: number; name: string; pos: string; gp: number; g: number; a: number; pts: number; teams: string };
type RosterPlayer = { id: number; name: string; pos: string };
type LogRow = { d: string; o: string; h: number; g: number; a: number; prev?: number };
type Stat = { gp: number; g: number; a: number; p: number };

type PlayerCard = {
  id: number;
  name: string;
  pos: string;
  stat: Stat; // estatística mostrada (época atual, ou a passada se ainda não jogou)
  statPrev: boolean; // true = estatística da época passada
  probGoal: number; // % (0 se fora)
  probAssist: number;
  probPoint: number;
  n: number; // jogos considerados (até 10)
  goalGames: number;
  assistGames: number;
  pointGames: number;
  goalStreak: number;
  pointStreak: number;
  last3Goals: number;
  last3Points: number;
  status?: "DTD" | "OUT";
  injury?: string; // texto do estado (ex.: "Out", "Day-To-Day")
  newTeam?: boolean; // já jogou por outra equipa esta época
  lowSample?: boolean; // poucos jogos esta época: percentagem menos fiável
  missed?: number; // jogos da equipa que falhou esta época (só se ≥ 3 e sem lesão ativa)
  log: LogRow[]; // mais recente primeiro
};

type TeamPlayers = {
  abbr: string;
  players: PlayerCard[];
  injured: { name: string; status: string }[]; // lesionados do plantel
  rosterSource: string;
};

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
  const key = `nhl:pl-leaders:v1:${season}`;
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
        a: num(r?.assists),
        pts: num(r?.points),
        teams: String(r?.teamAbbrevs ?? ""),
      });
    }
    await redis.setPx(key, JSON.stringify(rows), rows.length ? 60 * 60 * 1000 : 10 * 60 * 1000);
    return new Map(rows.map((p) => [p.id, p]));
  } catch (e) {
    console.error(`[players] estatísticas ${season} falharam:`, e);
    return null;
  }
}

// ─── Plantel atual (várias fontes) ───────────────────────────────────────────

const fullName = (p: any) =>
  `${p?.firstName?.default ?? p?.firstName ?? ""} ${p?.lastName?.default ?? p?.lastName ?? ""}`.trim() ||
  String(p?.skaterFullName ?? p?.name?.default ?? "");

/** lê { forwards, defensemen, goalies } (formato de /roster) */
function parseRosterGroups(data: any): RosterPlayer[] {
  const out: RosterPlayer[] = [];
  for (const [group, pos] of [["forwards", "F"], ["defensemen", "D"], ["goalies", "G"]] as const) {
    for (const p of Array.isArray(data?.[group]) ? data[group] : []) {
      const id = num(p?.id ?? p?.playerId);
      if (!id) continue;
      out.push({ id, name: fullName(p), pos: group === "forwards" ? String(p?.positionCode ?? pos) : pos });
    }
  }
  return out;
}

/** lê { skaters, goalies } (formato de /club-stats) */
function parseClubStats(data: any): RosterPlayer[] {
  const out: RosterPlayer[] = [];
  for (const [group, isG] of [["skaters", false], ["goalies", true]] as const) {
    for (const p of Array.isArray(data?.[group]) ? data[group] : []) {
      const id = num(p?.playerId ?? p?.id);
      if (!id) continue;
      out.push({ id, name: fullName(p), pos: isG ? "G" : String(p?.positionCode ?? "F") });
    }
  }
  return out;
}

async function tryJson(url: string): Promise<any | null> {
  try {
    const res = await fetchWithTimeout(url, {}, 8000);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

type Roster = { players: RosterPlayer[]; source: string };

async function fetchRoster(abbr: string, season: string, cur: Map<number, SeasonRow> | null): Promise<Roster | null> {
  const key = `nhl:roster:v2:${abbr}`;
  const cached = await redis.get(key);
  if (cached) {
    try {
      return JSON.parse(cached) as Roster;
    } catch {
      /* ignora cache inválida */
    }
  }

  const attempts: [string, () => Promise<RosterPlayer[]>][] = [
    ["current", async () => parseRosterGroups(await tryJson(`${NHL_API}/roster/${abbr}/current`))],
    ["season", async () => parseRosterGroups(await tryJson(`${NHL_API}/roster/${abbr}/${season}`))],
    ["club-stats", async () => parseClubStats(await tryJson(`${NHL_API}/club-stats/${abbr}/now`))],
    [
      "league-stats",
      async () =>
        [...(cur?.values() ?? [])]
          .filter((r) => r.teams.split(",").map((t) => t.trim()).pop() === abbr)
          .map((r) => ({ id: r.id, name: r.name, pos: r.pos === "D" ? "D" : "F" })),
    ],
  ];
  for (const [source, run] of attempts) {
    const players = await run();
    if (players.filter((p) => p.pos !== "G").length >= 8) {
      const roster = { players, source };
      await redis.setPx(key, JSON.stringify(roster), 3 * 60 * 60 * 1000);
      return roster;
    }
  }
  return null;
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

type Inj = { w: number; label: string; name: string };

/** nome normalizado do jogador → lesão (w: 0.5 = day-to-day, 1 = fora) */
function injuredOf(map: Map<string, InjuryEntry[]> | null, teamFullName: string): Map<string, Inj> {
  const out = new Map<string, Inj>();
  if (!map) return out;
  const n = normName(teamFullName);
  let entries = map.get(n);
  if (!entries) {
    const last = n.split(" ").pop();
    const hits = [...map.entries()].filter(([k]) => k.split(" ").pop() === last);
    entries = hits.length === 1 ? hits[0][1] : [];
  }
  for (const e of entries) {
    if (!e.name) continue;
    const k = normName(e.name);
    const w = unavailability(e.status);
    if (w >= (out.get(k)?.w ?? 0)) out.set(k, { w, label: e.status || "Lesionado", name: e.name });
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
  const gpg = (g + base.gpg * k) / (gp + k);
  const ppg = (pts + base.ppg * k) / (gp + k);
  return { gpg, ppg, apg: Math.max(0.02, ppg - gpg) };
}

function mergedHistory(curLog: LogRow[] | null, prevLog: LogRow[] | null): LogRow[] {
  const cur = curLog ?? [];
  if (cur.length >= GAMES_PER_PLAYER || !prevLog) return cur.slice(0, GAMES_PER_PLAYER);
  const need = GAMES_PER_PLAYER - cur.length;
  return [...cur, ...prevLog.slice(0, need).map((r) => ({ ...r, prev: 1 }))];
}

type Prior = { gpg: number; ppg: number; apg: number };

function buildCard(
  p: RosterPlayer,
  hist: LogRow[],
  prior: Prior,
  stat: Stat,
  statPrev: boolean,
  teamExp: number,
  inj?: Inj
): PlayerCard {
  const C = CFG;
  const n = hist.length;
  const out = !!inj && inj.w >= 1;
  const dtd = !!inj && inj.w < 1;

  const goalGames = hist.filter((r) => r.g > 0).length;
  const assistGames = hist.filter((r) => r.a > 0).length;
  const pointGames = hist.filter((r) => r.g + r.a > 0).length;

  const k = C.priorGames;
  const blend = (hits: number, rate: number) => (hits + k * (1 - Math.exp(-rate))) / (n + k);
  const pG = blend(goalGames, prior.gpg);
  const pA = blend(assistGames, prior.apg);
  const pP = blend(pointGames, prior.ppg);

  // Ajuste ao jogo de hoje: equipa com mais golos esperados → mais hipóteses para os seus jogadores
  const ratio = clamp(teamExp / C.refTeamGoals, C.ratioMin, C.ratioMax);
  const adj = (p0: number) => 1 - Math.pow(1 - p0, ratio);

  const availability = out ? 0 : dtd ? C.dtdFactor : 1;
  const pct = (x: number, cap: number) => Math.round(clamp(adj(x), 0, cap) * availability * 100);

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
    stat,
    statPrev,
    probGoal: pct(pG, C.cap.goal),
    probAssist: pct(pA, C.cap.assist),
    probPoint: pct(pP, C.cap.point),
    n,
    goalGames,
    assistGames,
    pointGames,
    goalStreak: streak((r) => r.g > 0),
    pointStreak: streak((r) => r.g + r.a > 0),
    last3Goals: last3.filter((r) => r.g > 0).length,
    last3Points: last3.filter((r) => r.g + r.a > 0).length,
    ...(inj ? { status: out ? ("OUT" as const) : ("DTD" as const), injury: inj.label } : {}),
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

    const [cur, prev, injuries] = await Promise.all([
      fetchSeasonRows(season),
      fetchSeasonRows(prevSeason),
      fetchInjuryMap(),
    ]);
    if (!cur && !prev) return json({ message: "Estatísticas de jogadores indisponíveis na NHL." }, 502);

    const rosterList = await Promise.all(abbrs.map(async (a) => [a, await fetchRoster(a, season, cur)] as const));
    const rosters = new Map(rosterList.filter(([, r]) => r).map(([a, r]) => [a, r as Roster]));
    if (rosters.size === 0) return json({ message: "Plantéis indisponíveis na NHL." }, 502);

    // 1) jogadores de cada equipa: os do plantel atual com mais rendimento (lesionados incluídos)
    type Cand = { p: RosterPlayer; prior: Prior; stat: Stat; statPrev: boolean; inj?: Inj; curGp: number; teamGp: number; newTeam: boolean };
    const pools = new Map<string, { cands: Cand[]; injured: { name: string; status: string }[]; source: string }>();
    for (const g of games) {
      for (const [abbr, name] of [[g.homeAbbr, g.homeName], [g.awayAbbr, g.awayName]] as const) {
        const roster = rosters.get(abbr);
        if (!roster || pools.has(abbr)) continue;
        const injMap = injuredOf(injuries, name);
        const skaters = roster.players.filter((p) => p.pos !== "G");
        // Estatística mostrada: a da época atual; no arranque (poucos jogos) a da época passada, igual para toda a equipa
        const maxCurGp = Math.max(0, ...skaters.map((p) => cur?.get(p.id)?.gp ?? 0));
        const useCur = maxCurGp >= MIN_SEASON_GAMES;
        const cands: Cand[] = skaters
          .map((p) => {
            const c = cur?.get(p.id);
            const pr = prev?.get(p.id);
            const src = useCur ? c : pr;
            return {
              p,
              prior: seasonPrior(p, c, pr),
              stat: { gp: src?.gp ?? 0, g: src?.g ?? 0, a: src?.a ?? 0, p: src?.pts ?? 0 },
              statPrev: !useCur,
              inj: injMap.get(normName(p.name)),
              curGp: c?.gp ?? 0,
              teamGp: maxCurGp,
              newTeam: String(c?.teams ?? "").split(/[\s,/]+/).filter(Boolean).length > 1,
            };
          })
          .sort((a, b) => b.prior.ppg - a.prior.ppg)
          .slice(0, POOL_PER_TEAM);
        const injured = roster.players
          .map((p) => injMap.get(normName(p.name)))
          .filter((x): x is Inj => !!x)
          .map((x) => ({ name: x.name, status: x.label }));
        pools.set(abbr, { cands, injured, source: roster.source });
      }
    }

    // 2) últimos jogos (época atual; época passada só se faltar histórico)
    const ids = [...new Set([...pools.values()].flatMap((t) => t.cands.map((x) => x.p.id)))].slice(0, MAX_PLAYERS);
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

    // 3) cartas por equipa (ordenadas por pontos da época; a vista pode reordenar)
    const teamResult = (abbr: string, teamExp: number): TeamPlayers => {
      const t = pools.get(abbr);
      const players = (t?.cands ?? [])
        .map((c) => {
          const card = buildCard(c.p, mergedHistory(curLogs.get(c.p.id) ?? null, prevLogs.get(c.p.id) ?? null), c.prior, c.stat, c.statPrev, teamExp, c.inj);
          if (c.newTeam) card.newTeam = true;
          if (c.curGp < 5) card.lowSample = true;
          const missed = c.teamGp - c.curGp;
          // "Regresso": falhou 3+ jogos da equipa e já não consta como lesionado (inferência, não confirmação)
          if (!card.status && missed >= 3) card.missed = missed;
          return card;
        })
        .sort((a, b) => b.stat.p - a.stat.p || b.stat.g - a.stat.g || b.probPoint - a.probPoint);
      return { abbr, players, injured: t?.injured ?? [], rosterSource: t?.source ?? "none" };
    };

    const out = games.map((g) => ({
      id: g.id,
      home: teamResult(g.homeAbbr, num(g.expHome, CFG.refTeamGoals)),
      away: teamResult(g.awayAbbr, num(g.expAway, CFG.refTeamGoals)),
    }));

    return json({
      games: out,
      meta: {
        season,
        players: ids.length,
        injuries: injuries ? "espn" : "unavailable",
        rosters: Object.fromEntries([...rosters].map(([a, r]) => [a, r.source])),
      },
    });
  } catch (e: any) {
    return json({ message: e?.message || "Erro interno no servidor." }, 500);
  }
}
