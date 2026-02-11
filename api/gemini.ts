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

// NHL schedule endpoint (público)
async function fetchNhlGames(date: string): Promise<Game[]> {
  // date esperado: YYYY-MM-DD
  const url = `https://api-web.nhle.com/v1/schedule/${date}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  if (!data?.gameWeek?.length) return [];

  const games: Game[] = [];

  for (const day of data.gameWeek) {
    const dayGames = Array.isArray(day?.games) ? day.games : [];
    for (const g of dayGames) {
      const id = g?.id;
      const home = g?.homeTeam?.abbrev;
      const away = g?.awayTeam?.abbrev;

      if (!id || !home || !away) continue;

      games.push({
        gameId: id,
        date,
        homeTeam: home,
        awayTeam: away,
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
      typeof req.body === "string" ? safeJsonParse(req.body) : (req.body ?? {});
    const selectedDate = body?.selectedDate;

    if (!selectedDate) {
      return res.status(400).json({
        message: "selectedDate obrigatório (YYYY-MM-DD)",
        predictions: [],
      });
    }

    // 1) Buscar jogos reais da NHL
    const games = await fetchNhlGames(selectedDate);

    if (!games.length) {
      return res.status(200).json({
        predictions: [],
        message: "Sem jogos nesta data (ou API NHL sem dados).",
        date: selectedDate,
      });
    }

    // 2) Pedir ao Gemini para analisar jogos reais
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
Responde APENAS com JSON válido (sem texto extra, sem markdown, sem \`\`\`).

Tens esta lista de jogos (reais) da NHL:
${JSON.stringify(games, null, 2)}

Gera previsões no formato:
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

Regras:
- Usa gameId/homeTeam/awayTeam exatamente como na lista.
- confidence entre 0 e 1.
- Se por algum motivo não conseguires analisar, devolve {"predictions": []}.
`.trim();

    const response = await ai.models.generateContent({
      // ✅ modelo corrigido (evita NOT_FOUND no v1beta)
      model: "gemini-1.5-flash-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const parsed = safeJsonParse(response.text || "") ?? {};
    const normalized = normalizePredictions(parsed);

    // Se o Gemini devolver predictions vazio, pelo menos devolvemos a lista de jogos para debug/UI
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
