import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "redis";

export const config = { runtime: "nodejs" };

// cache só do Gemini (caro)
const GEMINI_TTL_MS = 1000 * 60 * 60 * 12;

// Redis opcional
let _redis: ReturnType<typeof createClient> | null = null;
async function getRedis() {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const client = createClient({ url });
  client.on("error", (err) => console.error("Redis error:", err));
  await client.connect();
  _redis = client;
  return _redis;
}

function safeJsonParse(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}
function clampPct(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  const pct = v <= 1 ? v * 100 : v;
  return Math.max(0, Math.min(100, pct));
}
function defaultSuggestions() {
  return {
    tripleWin: [],
    tripleOver15P1: [],
    doubleOver15P1: [],
    drawSuggestions: [],
    quadrupleOver45: [],
    over55Suggestions: [],
  };
}
function normAbbr(abbr: string) {
  return (abbr || "").toUpperCase().trim();
}

// ---------------- NHL schedule (real) ----------------
type ScheduleGame = {
  id: number;
  startTimeUTC?: string;
  homeTeam?: { abbrev?: string; placeName?: { default?: string } };
  awayTeam?: { abbrev?: string; placeName?: { default?: string } };
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

// ---------------- ESPN injuries (real) - league endpoint ----------------
// Este endpoint costuma vir com a lista completa de lesionados na liga
// e é mais estável do que "teams/{id}".
type EspnInjuryRow = {
  athlete?: { displayName?: string };
  team?: { abbreviation?: string };
  status?: string;
  details?: { type?: string; detail?: string };
};

function simplifyStatus(status?: string) {
  const s = (status || "").toLowerCase();
  if (!s) return "";
  if (s.includes("out")) return "OUT";
  if (s.includes("questionable")) return "Q";
  if (s.includes("day-to-day") || s.includes("day to day")) return "DTD";
  if (s.includes("ir")) return "IR";
  return status || "";
}

async function fetchEspnLeagueInjuries(): Promise<EspnInjuryRow[]> {
  // Endpoint de injuries da NHL (ESPN site api)
  const url = "https://site.web.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries";
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return [];
  const data = await res.json();

  // Formato pode variar: tenta várias entradas
  const items =
    data?.injuries ||
    data?.sports?.[0]?.leagues?.[0]?.injuries ||
    data?.leagues?.[0]?.injuries ||
    [];

  if (!Array.isArray(items)) return [];
  return items as EspnInjuryRow[];
}

async function buildInjuriesByTeam(teamAbbrs: Set<string>) {
  const injuriesByTeam: Record<string, string[]> = {};
  for (const abbr of teamAbbrs) injuriesByTeam[abbr] = [];

  const rows = await fetchEspnLeagueInjuries();

  for (const r of rows) {
    const abbr = normAbbr(r?.team?.abbreviation || "");
    if (!abbr || !injuriesByTeam[abbr]) continue;

    const name = r?.athlete?.displayName || "";
    const status = simplifyStatus(r?.status || "");
    const detail = r?.details?.type || r?.details?.detail || "";

    const line = [name, status ? `(${status})` : "", detail ? `- ${detail}` : ""]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (line) injuriesByTeam[abbr].push(line);
  }

  return injuriesByTeam;
}

// ---------------- Gemini fallback ----------------
async function generateWithFallback(ai: GoogleGenAI, prompt: string) {
  const modelsToTry = ["gemini-3-flash-preview", "gemini-3-pro-preview", "gemini-2.0-flash"];
  let lastErr: any = null;

  for (const model of modelsToTry) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });
      const parsed = safeJsonParse(resp.text || "") ?? {};
      return { modelUsed: model, parsed };
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      if (msg.toLowerCase().includes("not found")) continue;
      throw e;
    }
  }
  throw new Error(`Nenhum modelo disponível. Último erro: ${String(lastErr?.message ?? lastErr)}`);
}

// ---------------- merge final (injuries fresh SEMPRE) ----------------
function mergeInjuriesIntoPredictions(geminiObj: any, sourceById: Record<string, any>) {
  const root = geminiObj && typeof geminiObj === "object" ? geminiObj : {};
  const predictions = Array.isArray(root.predictions) ? root.predictions : [];
  const suggestions =
    root.suggestions && typeof root.suggestions === "object"
      ? root.suggestions
      : defaultSuggestions();

  const lastUpdated = new Date().toISOString();

  if (predictions.length === 0) {
    const fallback = Object.values(sourceById).map((src: any) => ({
      id: String(src.id),
      homeTeam: src.homeTeam,
      homeTeamAbbr: src.homeTeamAbbr,
      homeRecordL10: "N/A",
      awayTeam: src.awayTeam,
      awayTeamAbbr: src.awayTeamAbbr,
      awayRecordL10: "N/A",
      dateTime: src.dateTime,
      winProbabilityHome: 0,
      winProbabilityAway: 0,
      over15P1Prob: 0,
      bttsP1Prob: 0,
      drawTRProb: 0,
      over45Prob: 0,
      over55Prob: 0,
      analysisSummary: "Sem análise (Gemini não devolveu output).",
      injuries: src.injuries,
    }));

    return { predictions: fallback, suggestions: defaultSuggestions(), lastUpdated };
  }

  const mergedPredictions = predictions.map((p: any) => {
    const id = String(p?.id ?? "");
    const src = sourceById[id];

    return {
      id,
      homeTeam: String(p?.homeTeam ?? src?.homeTeam ?? ""),
      homeTeamAbbr: String(p?.homeTeamAbbr ?? src?.homeTeamAbbr ?? ""),
      homeRecordL10: String(p?.homeRecordL10 ?? "N/A"),
      awayTeam: String(p?.awayTeam ?? src?.awayTeam ?? ""),
      awayTeamAbbr: String(p?.awayTeamAbbr ?? src?.awayTeamAbbr ?? ""),
      awayRecordL10: String(p?.awayRecordL10 ?? "N/A"),
      dateTime: String(p?.dateTime ?? src?.dateTime ?? ""),
      winProbabilityHome: clampPct(p?.winProbabilityHome),
      winProbabilityAway: clampPct(p?.winProbabilityAway),
      over15P1Prob: clampPct(p?.over15P1Prob),
      bttsP1Prob: clampPct(p?.bttsP1Prob),
      drawTRProb: clampPct(p?.drawTRProb),
      over45Prob: clampPct(p?.over45Prob),
      over55Prob: clampPct(p?.over55Prob),
      analysisSummary: String(p?.analysisSummary ?? ""),
      injuries: {
        home: (src?.injuries?.home ?? []).map(String),
        away: (src?.injuries?.away ?? []).map(String),
      },
    };
  });

  const sug = suggestions;
  const normalizedSuggestions = {
    tripleWin: Array.isArray(sug.tripleWin) ? sug.tripleWin.map(String) : [],
    tripleOver15P1: Array.isArray(sug.tripleOver15P1) ? sug.tripleOver15P1.map(String) : [],
    doubleOver15P1: Array.isArray(sug.doubleOver15P1) ? sug.doubleOver15P1.map(String) : [],
    drawSuggestions: Array.isArray(sug.drawSuggestions)
      ? sug.drawSuggestions.map((d: any) => ({ game: String(d?.game ?? ""), explanation: String(d?.explanation ?? "") }))
      : [],
    quadrupleOver45: Array.isArray(sug.quadrupleOver45) ? sug.quadrupleOver45.map(String) : [],
    over55Suggestions: Array.isArray(sug.over55Suggestions) ? sug.over55Suggestions.map(String) : [],
  };

  return { predictions: mergedPredictions, suggestions: normalizedSuggestions, lastUpdated };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ message: "Use POST." });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        message: "GEMINI_API_KEY não definida",
        predictions: [],
        suggestions: defaultSuggestions(),
        lastUpdated: new Date().toISOString(),
      });
    }

    const body = typeof req.body === "string" ? safeJsonParse(req.body) : (req.body ?? {});
    const selectedDate = body?.selectedDate;

    if (!selectedDate) {
      return res.status(400).json({
        message: "selectedDate obrigatório (YYYY-MM-DD)",
        predictions: [],
        suggestions: defaultSuggestions(),
        lastUpdated: new Date().toISOString(),
      });
    }

    // 1) Schedule real
    const scheduleGames = await fetchNhlScheduleGames(selectedDate);
    if (!scheduleGames.length) {
      return res.status(200).json({
        predictions: [],
        suggestions: defaultSuggestions(),
        lastUpdated: new Date().toISOString(),
      });
    }

    // 2) Injuries REAL (sempre fresh)
    const teamAbbrs = new Set<string>();
    for (const g of scheduleGames) {
      const h = normAbbr(g.homeTeam?.abbrev || "");
      const a = normAbbr(g.awayTeam?.abbrev || "");
      if (h) teamAbbrs.add(h);
      if (a) teamAbbrs.add(a);
    }
    const injuriesByTeam = await buildInjuriesByTeam(teamAbbrs);

    // Base por jogo
    const sourceById: Record<string, any> = {};
    const gamesForAI = scheduleGames.map((g) => {
      const id = String(g.id);
      const homeAbbr = normAbbr(g.homeTeam?.abbrev || "");
      const awayAbbr = normAbbr(g.awayTeam?.abbrev || "");

      const base = {
        id,
        dateTime: g.startTimeUTC ?? "",
        homeTeam: g.homeTeam?.placeName?.default ?? homeAbbr,
        homeTeamAbbr: homeAbbr,
        awayTeam: g.awayTeam?.placeName?.default ?? awayAbbr,
        awayTeamAbbr: awayAbbr,
        injuries: {
          home: injuriesByTeam[homeAbbr] ?? [],
          away: injuriesByTeam[awayAbbr] ?? [],
        },
      };

      sourceById[id] = base;
      return base;
    });

    // 3) Cache só Gemini
    const redis = await getRedis();
    const geminiCacheKey = `gemini_only:${selectedDate}`;

    let geminiObj: any = null;
    let geminiHit = false;

    if (redis) {
      try {
        const raw = await redis.get(geminiCacheKey);
        const cached = raw ? safeJsonParse(raw) : null;
        if (cached?.savedAt && Date.now() - cached.savedAt < GEMINI_TTL_MS) {
          geminiObj = cached.data;
          geminiHit = true;
        }
      } catch (e) {
        console.error("Redis read failed:", e);
      }
    }

    if (!geminiObj) {
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
Responde APENAS com JSON válido (sem texto extra).

Tens estes jogos da NHL para ${selectedDate}.
As lesões abaixo são REAIS. Usa-as no resumo/análise e NÃO inventes novas lesões.
${JSON.stringify(gamesForAI, null, 2)}

Devolve EXACTAMENTE este formato:
{
  "predictions": [
    {
      "id": "string",
      "homeTeam": "string",
      "homeTeamAbbr": "string",
      "homeRecordL10": "string",
      "awayTeam": "string",
      "awayTeamAbbr": "string",
      "awayRecordL10": "string",
      "dateTime": "string",
      "winProbabilityHome": 0,
      "winProbabilityAway": 0,
      "over15P1Prob": 0,
      "bttsP1Prob": 0,
      "drawTRProb": 0,
      "over45Prob": 0,
      "over55Prob": 0,
      "analysisSummary": "string"
    }
  ],
  "suggestions": {
    "tripleWin": ["string"],
    "tripleOver15P1": ["string"],
    "doubleOver15P1": ["string"],
    "drawSuggestions": [{ "game": "string", "explanation": "string" }],
    "quadrupleOver45": ["string"],
    "over55Suggestions": ["string"]
  }
}

REGRAS:
- Todas as probabilidades DEVEM ser percentagens 0..100 (ex: 72.5).
- id deve bater certo com o id do jogo.
- Se não souberes records L10, usa "N/A".
- NÃO inventes lesões.
`.trim();

      const { parsed } = await generateWithFallback(ai, prompt);
      geminiObj = parsed;

      if (redis) {
        try {
          await redis.set(
            geminiCacheKey,
            JSON.stringify({ savedAt: Date.now(), data: geminiObj }),
            { PX: GEMINI_TTL_MS }
          );
        } catch (e) {
          console.error("Redis save failed:", e);
        }
      }
    }

    const finalData: any = mergeInjuriesIntoPredictions(geminiObj, sourceById);

    // DEBUG: confirma cache + contagem de injuries por equipa
    finalData.meta = {
      selectedDate,
      cache: { geminiHit, key: geminiCacheKey },
      injuriesCounts: Object.fromEntries(
        Object.entries(injuriesByTeam).map(([k, v]) => [k, v.length])
      ),
    };

    return res.status(200).json(finalData);
  } catch (err: any) {
    return res.status(500).json({
      message: "Erro interno",
      details: String(err?.message ?? err),
      predictions: [],
      suggestions: defaultSuggestions(),
      lastUpdated: new Date().toISOString(),
    });
  }
}
