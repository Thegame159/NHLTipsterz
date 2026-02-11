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

function normalizePredictions(obj: any) {
  const root = obj && typeof obj === "object" ? obj : {};
  const predictions = Array.isArray(root.predictions) ? root.predictions : [];
  return { ...root, predictions };
}

function isModelNotFound(msg: string) {
  const m = msg.toLowerCase();
  return m.includes("not found") || m.includes("model") && m.includes("not") && m.includes("found");
}

// NHL API pública — schedule
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

async function generateWithFallback(ai: GoogleGenAI, prompt: string) {
  // Estes são modelos que, na tua app, têm mais probabilidade de existir.
  // O primeiro ("gemini-3-flash-preview") já funcionou contigo antes.
  const modelsToTry = [
    "gemini-3-flash-preview",
    "gemini-3-pro-preview",
    "gemini-2.0-flash",
  ];

  let lastErr: any = null;

  for (const model of modelsToTry) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const parsed = safeJsonParse(resp.text || "") ?? {};
      return { modelUsed: model, parsed };
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e);

      // Se for "model not found", tenta o próximo
      if (isModelNotFound(msg)) continue;

      // Outros erros (quota, invalid arg, etc.) — não vale tentar outro modelo
      throw e;
    }
  }

  // Se chegou aqui, todos os modelos falharam (provavelmente NOT_FOUND)
  const msg = String(lastErr?.message ?? lastErr);
  const err = new Error(`Nenhum modelo disponível. Último erro: ${msg}`);
  (err as any).cause = lastErr;
  throw err;
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

    // 1) Jogos reais da NHL
    const games = await fetchNhlGames(selectedDate);

    if (!games.length) {
      return res.status(200).json({
        predictions: [],
        message: "Sem jogos nesta data (ou API NHL sem dados).",
        date: selectedDate,
        games: [],
      });
    }

    // 2) Gemini analisa os jogos reais
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
Responde APENAS com JSON válido (sem texto extra, sem markdown).

Jogos reais da NHL:
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

Regras:
- Usa gameId/homeTeam/awayTeam exatamente como na lista.
- confidence entre 0 e 1.
- Se não conseguires analisar, devolve {"predictions": []}.
`.trim();

    const { modelUsed, parsed } = await generateWithFallback(ai, prompt);
    const normalized = normalizePredictions(parsed);

    return res.status(200).json({
      ...normalized,
      modelUsed,
      games,
      date: selectedDate,
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
