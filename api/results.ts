import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { runtime: "nodejs" };

// --- Helpers ---
function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = String(req.headers.origin ?? "");
  const allowlist = new Set([
    "capacitor://localhost",
    "http://localhost",
    "https://nhl-tipsterz.vercel.app",
  ]);
  const allowOrigin = allowlist.has(origin) ? origin : "*";
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

type ScheduleGame = {
  id: number;
  startTimeUTC?: string;
  homeTeam?: { abbrev?: string };
  awayTeam?: { abbrev?: string };
};

async function fetchNhlScheduleGames(date: string): Promise<ScheduleGame[]> {
  const url = `https://api-web.nhle.com/v1/schedule/${date}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();

  const games: ScheduleGame[] = [];
  if (!data?.gameWeek?.length) return games;

  for (const day of data.gameWeek) {
    if (!Array.isArray(day?.games)) continue;
    for (const g of day.games) if (g?.id) games.push(g);
  }
  return games;
}

type GameResult = {
  gameId: number;
  awayAbbr: string;
  homeAbbr: string;
  status: "FINAL" | "LIVE" | "SCHEDULED" | "UNKNOWN";

  finalAway: number;
  finalHome: number;

  regAway: number;
  regHome: number;

  p1Away: number;
  p1Home: number;

  winnerAbbr: string | null;
};

function safeNum(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function normAbbr(s: string) {
  return (s || "").toUpperCase().trim();
}

async function fetchBoxscore(gameId: number): Promise<any | null> {
  const url = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

function deriveResultFromBoxscore(
  console.log(JSON.stringify(box?.linescore, null, 2));
  gameId: number,
  awayAbbr: string,
  homeAbbr: string,
  box: any
): GameResult {

  // ✅ STATUS CORRIGIDO
  const rawState = String(box?.gameState ?? "").toUpperCase();

  let status: GameResult["status"] = "UNKNOWN";

  if (rawState === "OFF") {
    status = "FINAL";
  } else if (rawState === "LIVE") {
    status = "LIVE";
  } else if (rawState === "FUT") {
    status = "SCHEDULED";
  } else if (["FINAL", "OFFICIAL", "OVER"].some((k) => rawState.includes(k))) {
    status = "FINAL";
  } else if (["INPROGRESS", "IN PROGRESS"].some((k) => rawState.includes(k))) {
    status = "LIVE";
  }

  // Totais finais
  const finalAway = safeNum(box?.awayTeam?.score ?? box?.summary?.away?.score);
  const finalHome = safeNum(box?.homeTeam?.score ?? box?.summary?.home?.score);

  // Períodos
const byPeriod =
  Array.isArray(box?.linescore?.periods)
    ? box.linescore.periods
    : Array.isArray(box?.periods)
    ? box.periods
    : [];

  const p1 = byPeriod?.[0] ?? {};
  const p2 = byPeriod?.[1] ?? {};
  const p3 = byPeriod?.[2] ?? {};

  const p1Away = safeNum(p1?.awayGoals ?? p1?.awayScore ?? p1?.away ?? p1?.awayTeam?.goals);
  const p1Home = safeNum(p1?.homeGoals ?? p1?.homeScore ?? p1?.home ?? p1?.homeTeam?.goals);

  const p2Away = safeNum(p2?.awayGoals ?? p2?.awayScore ?? p2?.away ?? p2?.awayTeam?.goals);
  const p2Home = safeNum(p2?.homeGoals ?? p2?.homeScore ?? p2?.home ?? p2?.homeTeam?.goals);

  const p3Away = safeNum(p3?.awayGoals ?? p3?.awayScore ?? p3?.away ?? p3?.awayTeam?.goals);
  const p3Home = safeNum(p3?.homeGoals ?? p3?.homeScore ?? p3?.home ?? p3?.homeTeam?.goals);

  const has3Periods = byPeriod.length >= 3;
  const regAway = has3Periods ? (p1Away + p2Away + p3Away) : finalAway;
  const regHome = has3Periods ? (p1Home + p2Home + p3Home) : finalHome;

  let winnerAbbr: string | null = null;
  if (finalAway !== finalHome) {
    winnerAbbr = finalAway > finalHome ? awayAbbr : homeAbbr;
  }

  return {
    gameId,
    awayAbbr,
    homeAbbr,
    status,
    finalAway,
    finalHome,
    regAway,
    regHome,
    p1Away,
    p1Home,
    winnerAbbr,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    setCors(req, res);

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ message: "Use GET." });

    const date = String(req.query.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: "date obrigatório (YYYY-MM-DD)" });
    }

   function addDays(d: string, days: number) {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const nextDate = addDays(date, 1);

const [gamesToday, gamesNext] = await Promise.all([
  fetchNhlScheduleGames(date),
  fetchNhlScheduleGames(nextDate),
]);

const scheduleGames = [...gamesToday, ...gamesNext].filter(g => {
  if (!g.startTimeUTC) return false;

  const gameDateET = new Date(g.startTimeUTC).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  return gameDateET === date;
});
    if (!scheduleGames.length) {
      return res.status(200).json({ date, games: [], meta: { note: "Sem jogos nesta data." } });
    }

    const settled = await Promise.allSettled(
      scheduleGames.map(async (g) => {
        const gameId = g.id;
        const awayAbbr = normAbbr(g.awayTeam?.abbrev || "");
        const homeAbbr = normAbbr(g.homeTeam?.abbrev || "");
        const box = await fetchBoxscore(gameId);

        if (!box) {
          return {
            gameId,
            awayAbbr,
            homeAbbr,
            status: "UNKNOWN" as const,
            finalAway: 0,
            finalHome: 0,
            regAway: 0,
            regHome: 0,
            p1Away: 0,
            p1Home: 0,
            winnerAbbr: null,
          } satisfies GameResult;
        }

        return deriveResultFromBoxscore(gameId, awayAbbr, homeAbbr, box);
      })
    );

    const results: GameResult[] = settled
      .filter((s) => s.status === "fulfilled")
      .map((s: any) => s.value);

    const byMatchup: Record<string, GameResult> = {};
    for (const r of results) {
      const key = `${r.awayAbbr} VS ${r.homeAbbr}`;
      byMatchup[key] = r;
    }

    return res.status(200).json({
      date,
      games: results,
      byMatchup,
      meta: { count: results.length },
    });
  } catch (err: any) {
    return res.status(500).json({
      message: "Erro interno",
      details: String(err?.message ?? err),
    });
  }
}
