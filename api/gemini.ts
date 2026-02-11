import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";

export const config = {
  runtime: "nodejs",
};

type Game = {
  gameId: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
};

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// 🔥 NHL API pública
async function fetchNhlGames(date: string): Promise<Game[]> {
  const url = `https://api-web.nhle.com/v1/schedule/${date}`;
  const res = await fetch(url);

  if (!res.ok) return [];

  const data = await res.json();
  if (!data?.gameWeek?.length) return [];

  const games: Game[] = [];

  for (const day of data.gameWeek) {
    if (!Array.isArray(day?.games)) continue;

    for (const g of day.games) {
      if (!g?.id || !g?.homeTeam?.abbrev || !g?.awayTeam?.abbrev) continue;

      games.push({
        gameId: g.id,
        date,
        homeTeam: g.homeTeam.abbrev,
        awayTeam: g.awayTeam.abbrev,
      });
    }
  }

  return games;
}

function normalizePredictions(obj: any) {
  const root = obj && typeof obj === "object" ? obj : {};
  const predictions = Array.isArray(root.predictions) ? root.predictions : [];
  return { ...root, predictions };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Use POST", predictions: [] });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        message: "GEMINI_API_KEY não definida",
        predictions: [],
      });
    }

    const body =
      typeof req.body === "string" ? safeJsonParse(req.body) : req.body;

    const selectedDate = body?.selectedDate;

    if (!selectedDate) {
      return res.status(400).json({
        message: "selectedDate obrigatório (YYYY-MM-DD)",
        predictions: [],
      });
    }

    // 1️⃣ Buscar jogos reais
    const games = await fetchNhlGames(selectedDate);

    if (!games.length) {
      return res.status(200).json({
        predictions: [],
        message: "Sem jogos nesta data",
        date: selectedDate,
      });
    }

    // 2️⃣ Analisar jogos com Gemini
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
Responde APENAS com JSON válido (sem texto extra).

Jogos:
${JSON.stringify(games, null, 2)}

Formato obrigatório:
{
  "predictions": [
    {
      "gameId": 123,
      "date": "YYYY-MM-DD",
      "homeTeam": "ABC",
      "awayTeam": "DEF",
      "pick": "string",
      "confidence": 0.0,
      "reason": "string"
    }
  ]
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-1.0-pro", // ✅ compatível com v1beta
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const parsed = safeJsonParse(response.text || "") ?? {};
    const normalized = normalizePredictions(parsed);

    return res.status(200).json({
      ...normalized,
      games,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({
      message: "Erro interno",
      details: String(err?.message ?? err),
      predictions: [],
    });
  }
}
