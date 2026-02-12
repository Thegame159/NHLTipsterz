import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "redis";

export const config = { runtime: "nodejs" };

// Cache só para o output do Gemini (probabilidades/sugestões)
// Lesões: SEMPRE fresh
const GEMINI_TTL_MS = 1000 * 60 * 60 * 12; // 12h (ajusta)

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
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

// ------------------ NHL schedule (real) ------------------
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
    for (const g of day.games) {
      if (g?.id) games.push(g);
    }
  }

  return games;
}

// ------------------ ESPN injuries (real) ------------------
const ESPN_TEAM_ID: Record<string, number> = {
  ANA: 25,
  BOS: 1,
  BUF: 2,
  CAR: 7,
  CBJ: 29,
  CGY: 3,
  CHI: 4,
  COL: 17,
  DAL: 9,
  DET: 5,
  EDM: 6,
  FLA: 26,
  LAK: 8,
  MIN: 30,
  MTL: 10,
  NJD: 11,
  NSH: 27,
  NYI: 12,
  NYR: 13,
  OTT: 14,
  PHI: 15,
  PIT: 16,
  SEA: 124292,
  SJS: 18,
  STL: 19,
  TBL: 20,
  TOR: 21,
  VAN: 22,
  VGK: 37,
  WPG: 52,
  WSH: 23,

  // Se o teu schedule devolver UTA, diz-me e eu meto o ID correto
  // UTA: ???,
};

function normAbbr(abbr: string) {
  return (abbr || "").toUpperCase().trim();
}

function simplifyStatus(status?: string) {
  const s = (status || "").toLowerCase();
  if (!s) return "";
  if (s.includes("out")) return "OUT";
  if (s.includes("questionable")) return "Q";
  if (s.includes("day-to-day") || s.includes("day to day")) return "DTD";
  if (s.includes("ir")) return "IR";
  return status || "";
}

async function fetchEspnInjuriesByTeamAbbr(teamAbbr: string): Promise<string[]> {
  const abbr = normAbbr(teamAbbr);
  const id = ESPN_TEAM_ID[abbr];
  if (!id) return [];

  const url = `https://site.web.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${id}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return [];

  const data = await res.json();
  const injuries = data?.team?.injuries ?? data?.injuries ?? [];
  if (!Array.isArray(injuries)) return [];

  const out: string[] = [];
  for (const item of injuries) {
    const athlete =
      item?.athlete?.displayName ||
      item?.athlete?.fullName ||
      item?.athlete?.name ||
      "";

    const status = simplifyStatus(item?.status || item?.injuryStatus || "");
    const detail =
      item?.details?.type || item?.type || item?.details?.detail || "";

    const line = [athlete, status ? `(${status})` : "", detail ? `- ${detail}` : ""]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (line) out.push(line);
  }

  return out;
}

// ------------------ Gemini with fallback ------------------
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

// ------------------ Merge final (injuries sempre fresh) ------------------
function mergeInjuriesIntoPredictions(geminiObj: any, sourceById: Record<string, any>) {
  const root = geminiObj && typeof geminiObj === "object" ? geminiObj : {};
  const predictions = Array.isArray(root.predictions) ? root.predictions : [];
  const suggestions =
    root.suggestions && typeof root.suggestions === "object"
      ? root.suggestions
      : defaultSuggestions();

  const lastUpdated = new Date().toISOString();

  // Se Gemini não devolver predictions, devolvemos base com injuries reais
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
      // ✅ FORÇA SEMPRE as injuries reais (fresh)
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

    // 1) SEMPRE buscar schedule real
    const scheduleGames = await fetchNhlScheduleGames(selectedDate);
    if (!scheduleGames.length) {
      return res.status(200).json({
        predictions: [],
        suggestions: defaultSuggestions(),
        lastUpdated: new Date().toISOString(),
      });
    }

    // 2) SEMPRE buscar injuries reais (fresh)
    const teamAbbrs = new Set<string>();
    for (const g of scheduleGames) {
      const h = normAbbr(g.homeTeam?.abbrev || "");
      const a = normAbbr(g.awayTeam?.abbrev || "");
      if (h) teamAbbrs.add(h);
      if (a) teamAbbrs.add(a);
    }

    const injuriesByTeam: Record<string, string[]> = {};
    await Promise.all(
      Array.from(teamAbbrs).map(async (abbr) => {
        injuriesByTeam[abbr] = await fetchEspnInjuriesByTeamAbbr(abbr);
      })
    );

    // Base source por jogo (verdade)
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

    // 3) Cache SÓ do Gemini (caro). Injuries não entram no cache.
    const redis = await getRedis();
    const geminiCacheKey = `gemini_only:${selectedDate}`;
    let geminiObj: any = null;

    if (redis) {
      try {
        const raw = await redis.get(geminiCacheKey);
        const cached = raw ? safeJsonParse(raw) : null;
        if (cached?.savedAt && Date.now() - cached.savedAt < GEMINI_TTL_MS) {
          geminiObj = cached.data;
        }
      } catch (e) {
        console.error("Redis read Gemini cache failed:", e);
      }
    }

    // Se não houver cache do Gemini, chama Gemini
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
          console.error("Redis save Gemini cache failed:", e);
        }
      }
    }

    // 4) Merge final: PROB do Gemini + injuries reais fresh
    const finalData = mergeInjuriesIntoPredictions(geminiObj, sourceById);

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
