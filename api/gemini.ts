import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";

export const config = {
  runtime: "nodejs",
};

function formatDateToNhl(date: string) {
  // recebe YYYY-MM-DD e devolve YYYY-MM-DD
  return date;
}

async function fetchNhlGames(date: string) {
  const formatted = formatDateToNhl(date);
  const url = `https://api-web.nhle.com/v1/schedule/${formatted}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();

  if (!data?.gameWeek?.length) return [];

  const games: any[] = [];

  data.gameWeek.forEach((day: any) => {
    if (!day.games) return;

    day.games.forEach((g: any) => {
      games.push({
        gameId: g.id,
        date: formatted,
        homeTeam: g.homeTeam?.abbrev,
        awayTeam: g.awayTeam?.abbrev,
      });
    });
  });

  return games;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Use POST" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        message: "GEMINI_API_KEY não definida",
      });
    }

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const selectedDate = body?.selectedDate;
    if (!selectedDate) {
      return res.status(400).json({
        message: "selectedDate obrigatório",
      });
    }

    // 🔥 1. Buscar jogos reais
    const games = await fetchNhlGames(selectedDate);

    if (!games.length) {
      return res.status(200).json({
        predictions: [],
        message: "Sem jogos nesta data",
      });
    }

    // 🔥 2. Pedir análise ao Gemini sobre jogos reais
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
Analisa os seguintes jogos da NHL:

${JSON.stringify(games, null, 2)}

Responde APENAS com JSON neste formato:
{
  "predictions": [
    {
      "gameId": "number",
      "pick": "string",
      "confidence": 0.0,
      "reason": "string"
    }
  ]
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const result = JSON.parse(response.text || "{}");

    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({
      message: "Erro interno",
      details: String(err?.message ?? err),
      predictions: [],
    });
  }
}
