import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";

export const config = { runtime: "nodejs" };

type ScheduleGame = {
  id: number;
  startTimeUTC?: string;
  homeTeam?: { abbrev?: string; placeName?: { default?: string } };
  awayTeam?: { abbrev?: string; placeName?: { default?: string } };
};

function safeJsonParse(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

function isModelNotFound(msg: string) {
  const m = msg.toLowerCase();
  return m.includes("not found") || (m.includes("model") && m.includes("not") && m.includes("found"));
}

async function fetchNhlScheduleGames(date: string): Promise<ScheduleGame[]> {
  const url = `https://api-web.nhle.com/v1/schedule/${date}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data?.gameWeek?.length) return [];

  const games: ScheduleGame[] = [];
  for (const day of data.gameWeek) {
    if (!Array.isArray(day?.games)) continue;
    for (const g of day.games) if (g?.id) games.push(g);
  }
  return games;
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

// Converte para percentagem 0..100 (se vier 0..1 também funciona)
function clampPct(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  const pct = v <= 1 ? v * 100 : v;
  return Math.max(0, Math.min(100, pct));
}

function normalizeOutput(obj: any) {
  const root = obj && typeof obj === "object" ? obj : {};
  const predictions = Array.isArray(root.predictions) ? root.predictions : [];
  const suggestions =
    root.suggestions && typeof root.suggestions === "object"
      ? root.suggestions
      : defaultSuggestions();

  const lastUpdated =
    typeof root.lastUpdated === "string" ? root.lastUpdated : new Date().toISOString();

  const normalizedPredictions = predictions.map((p: any) => {
    const injuriesHome = Array.isArray(p?.injuries?.home) ? p.injuries.home : [];
    const injuriesAway = Array.isArray(p?.injuries?.away) ? p.injuries.away : [];

    return {
      id: String(p?.id ?? ""),
      homeTeam: String(p?.homeTeam ?? ""),
      homeTeamAbbr: String(p?.homeTeamAbbr ?? ""),
      homeRecordL10: String(p?.homeRecordL10 ?? "N/A"),
      awayTeam: String(p?.awayTeam ?? ""),
      awayTeamAbbr: String(p?.awayTeamAbbr ?? ""),
      awayRecordL10: String(p?.awayRecordL10 ?? "N/A"),
      dateTime: String(p?.dateTime ?? ""),
      winProbabilityHome: clampPct(p?.winProbabilityHome),
      winProbabilityAway: clampPct(p?.winProbabilityAway),
      over15P1Prob: clampPct(p?.over15P1Prob),
      bttsP1Prob: clampPct(p?.bttsP1Prob),
      drawTRProb: clampPct(p?.drawTRProb),
      over45Prob: clampPct(p?.over45Prob),
      over55Prob: clampPct(p?.over55Prob),
      analysisSummary: String(p?.analysisSummary ?? ""),
      injuries: {
        home: injuriesHome.map((x: any) => String(x)),
        away: injuriesAway.map((x: any) => String(x)),
      },
    };
  });

  const sug = suggestions;
  const normalizedSuggestions = {
    tripleWin: Array.isArray(sug.tripleWin) ? sug.tripleWin.map(String) : [],
    tripleOver15P1: Array.isArray(sug.tripleOver15P1) ? sug.tripleOver15P1.map(String) : [],
    doubleOver15P1: Array.isArray(sug.doubleOver15P1) ? sug.doubleOver15P1.map(String) : [],
    drawSuggestions: Array.isArray(sug.drawSuggestions)
      ? sug.drawSuggestions.map((d: any) => ({
          game: String(d?.game ?? ""),
          explanation: String(d?.explanation ?? ""),
        }))
      : [],
    quadrupleOver45: Array.isArray(sug.quadrupleOver45) ? sug.quadrupleOver45.map(String) : [],
    over55Suggestions: Array.isArray(sug.over55Suggestions) ? sug.over55Suggestions.map(String) : [],
  };

  return {
    predictions: normalizedPredictions,
    suggestions: normalizedSuggestions,
    lastUpdated,
  };
}

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
      if (isModelNotFound(msg)) continue;
      throw e;
    }
  }

  throw new Error(`Nenhum modelo disponível. Último erro: ${String(lastErr?.message ?? lastErr)}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ message: "Use POST" });

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

    const scheduleGames = await fetchNhlScheduleGames(selectedDate);

    if (!scheduleGames.length) {
      return res.status(200).json({
        predictions: [],
        suggestions: defaultSuggestions(),
        lastUpdated: new Date().toISOString(),
      });
    }

    const gamesForAI = scheduleGames.map((g) => ({
      id: g.id,
      dateTime: g.startTimeUTC ?? "",
      homeTeam: g.homeTeam?.placeName?.default ?? g.homeTeam?.abbrev ?? "",
      homeTeamAbbr: g.homeTeam?.abbrev ?? "",
      awayTeam: g.awayTeam?.placeName?.default ?? g.awayTeam?.abbrev ?? "",
      awayTeamAbbr: g.awayTeam?.abbrev ?? "",
    }));

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
Responde APENAS com JSON válido (sem texto extra).

Jogos NHL para ${selectedDate}:
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
      "analysisSummary": "string",
      "injuries": { "home": ["string"], "away": ["string"] }
    }
  ],
  "suggestions": {
    "tripleWin": ["string"],
    "tripleOver15P1": ["string"],
    "doubleOver15P1": ["string"],
    "drawSuggestions": [{ "game": "string", "explanation": "string" }],
    "quadrupleOver45": ["string"],
    "over55Suggestions": ["string"]
  },
  "lastUpdated": "ISO8601 string"
}

REGRAS IMPORTANTES:
- Todas as probabilidades DEVEM ser percentagens 0..100 (ex: 72.5).
- id deve ser o id do jogo convertido para string.
- Se não souberes records/lesões: usa "N/A" e arrays vazios.
`.trim();

    const { parsed } = await generateWithFallback(ai, prompt);
    const normalized = normalizeOutput(parsed);

    return res.status(200).json(normalized);
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
