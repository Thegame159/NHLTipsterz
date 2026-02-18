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

  // Totais finais (inclui OT/SO se houver)
  finalAway: number;
  finalHome: number;

  // Totais até ao fim do 3º período (tempo regulamentar)
  regAway: number;
  regHome: number;

  // 1º período
  p1Away: number;
  p1Home: number;

  winnerAbbr: string | null; // vencedor final (incl OT/SO)
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

function deriveResultFromBoxscore(gameId: number, awayAbbr: string, homeAbbr: string, box: any): GameResult {
  // status
  const gameState = String(box?.gameState || box?.gameStateId || "").toUpperCase();
  let status: GameResult["status"] = "UNKNOWN";
  if (["FINAL", "OFFICIAL", "OVER"].some((k) => gameState.includes(k))) status = "FINAL";
  else if (["LIVE", "INPROGRESS", "IN PROGRESS"].some((k) => gameState.includes(k))) status = "LIVE";
  else if (["FUT", "PRE", "SCHEDULED"].some((k) => gameState.includes(k))) status = "SCHEDULED";

  // Totais finais (boxscore costuma ter awayTeam.score / homeTeam.score)
  const finalAway = safeNum(box?.awayTeam?.score ?? box?.summary?.away?.score);
  const finalHome = safeNum(box?.homeTeam?.score ?? box?.summary?.home?.score);

  // Por períodos: tenta vários formatos
  // 1) box.linescore.byPeriod (com awayGoals/homeGoals)
  // 2) box.periods (array)
  const byPeriod =
    Array.isArray(box?.linescore?.byPeriod) ? box.linescore.byPeriod :
    Array.isArray(box?.periods) ? box.periods :
    [];

  const p1 = byPeriod?.[0] ?? {};
  const p1Away = safeNum(p1?.awayGoals ?? p1?.awayScore ?? p1?.away ?? p1?.awayTeam?.goals);
  const p1Home = safeNum(p1?.homeGoals ?? p1?.homeScore ?? p1?.home ?? p1?.homeTeam?.goals);

  // reg totals: soma períodos 1..3 se existirem
  const p2 = byPeriod?.[1] ?? {};
  const p3 = byPeriod?.[2] ?? {};
  const p2Away = safeNum(p2?.awayGoals ?? p2?.awayScore ?? p2?.away ?? p2?.awayTeam?.goals);
  const p2Home = safeNum(p2?.homeGoals ?? p2?.homeScore ?? p2?.home ?? p2?.homeTeam?.goals);
  const p3Away = safeNum(p3?.awayGoals ?? p3?.awayScore ?? p3?.away ?? p3?.awayTeam?.goals);
  const p3Home = safeNum(p3?.homeGoals ?? p3?.homeScore ?? p3?.home ?? p3?.homeTeam?.goals);

  const has3Periods = byPeriod.length >= 3;
  const regAway = has3Periods ? (p1Away + p2Away + p3Away) : finalAway; // fallback
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

    const scheduleGames = await fetchNhlScheduleGames(date);
    if (!scheduleGames.length) {
      return res.status(200).json({ date, games: [], meta: { note: "Sem jogos nesta data." } });
    }

    // fetch boxscores (paralelo com allSettled)
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

    // Também criamos lookup por "AWAY VS HOME"
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
