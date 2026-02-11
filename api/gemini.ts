import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "redis";

export const config = {
  runtime: "nodejs",
};

const TTL_MS = 1000 * 60 * 60 * 24; // 24h

function isQuotaError(msg: string) {
  const m = msg.toLowerCase();
  return (
    m.includes("429") ||
    m.includes("resource_exhausted") ||
    m.includes("quota") ||
    m.includes("rate limit")
  );
}

// Reutiliza conexão entre invocações (quando possível)
let _redis: ReturnType<typeof createClient> | null = null;

async function getRedis() {
  if (_redis) return _redis;

  const url = process.env.REDIS_URL;
  if (!url) return null; // cache opcional

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

function normalizeResult(obj: any) {
  // Garante SEMPRE que existe predictions: []
  const predictions = Array.isArray(obj?.predictions) ? obj.predictions : [];
  return { ...(obj && typeof obj === "object" ? obj : {}), predictions };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res
        .status(405)
        .json({ code: "METHOD_NOT_ALLOWED", message: "Use POST." });
    }

    // Na Vercel tens GEMINI_API_KEY
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        code: "MISSING_GEMINI_API_KEY",
        message:
          "GEMINI_API_KEY não definida nas Environment Variables da Vercel.",
      });
    }

    // Em Vercel Functions (não-Next), o body pode vir como string
    const body =
      typeof req.body === "string" ? safeJsonParse(req.body) : (req.body ?? {});
    const selectedDate = body?.selectedDate;

    if (!selectedDate) {
      return res.status(400).json({
        code: "MISSING_SELECTED_DATE",
        message: "'selectedDate' obrigatório.",
      });
    }

    const cacheKey = `gemini:${selectedDate}`;
    const now = Date.now();

    // --- CACHE (Redis) ---
    const redis = await getRedis();
    let cachedEntry: any = null;

    if (redis) {
      try {
        const cachedRaw = await redis.get(cacheKey);
        if (cachedRaw) {
          cachedEntry = safeJsonParse(cachedRaw);
          const age = now - (cachedEntry?.lastUpdated ?? 0);

          // ✅ ALTERAÇÃO ELEGANTE:
          // Só usa cache se:
          // - não expirou (age < TTL)
          // - E tiver predictions com pelo menos 1 item
          if (
            cachedEntry?.data &&
            age < TTL_MS &&
            Array.isArray(cachedEntry.data.predictions) &&
            cachedEntry.data.predictions.length > 0
          ) {
            const normalized = normalizeResult(cachedEntry.data);

            return res.status(200).json({
              ...normalized,
              lastUpdated: normalized.lastUpdated ?? new Date().toISOString(),
              cache: { hit: true, ageMs: age },
            });
          }
        }
      } catch (e: any) {
        console.error("Redis get failed:", e?.message ?? e);
      }
    }

    // --- GEMINI ---
    try {
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
Responde APENAS com JSON válido. Sem texto extra, sem markdown, sem blocos \`\`\`.

Formato obrigatório (tem de existir "predictions" como array):
{
  "predictions": [
    {
      "gameId": "string",
      "date": "YYYY-MM-DD",
      "homeTeam": "string",
      "awayTeam": "string",
      "pick": "string",
      "confidence": 0.0,
      "reason": "string"
    }
  ]
}

Analisa os jogos da NHL na data: ${selectedDate}.

Regras:
- "confidence" é um número entre 0 e 1.
- Se não houver jogos ou não conseguires obter dados, devolve EXATAMENTE:
{"predictions":[]}
`.trim();

      const response = await ai.models.generateContent({
        // Se este modelo falhar, troca para: "gemini-1.5-flash"
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const parsed = safeJsonParse(response.text || "");
      const normalized = normalizeResult(parsed);

      const payload = {
        ...normalized,
        lastUpdated: new Date().toISOString(),
      };

      // --- Guarda cache ---
      // Nota: nós guardamos mesmo que venha vazio, mas ele NÃO será usado no futuro
      // (por causa do if acima que exige predictions.length > 0)
      if (redis) {
        try {
          await redis.set(
            cacheKey,
            JSON.stringify({ data: payload, lastUpdated: now }),
            { PX: TTL_MS }
          );
        } catch (e: any) {
          console.error("Redis set failed:", e?.message ?? e);
        }
      }

      return res.status(200).json({
        ...payload,
        cache: { hit: false, ageMs: 0 },
      });
    } catch (e: any) {
      const msg = String(e?.message ?? "Gemini error");

      // Se quota e tem cache velho, devolve cache stale (normalizado)
      if (isQuotaError(msg) && cachedEntry?.data) {
        const normalized = normalizeResult(cachedEntry.data);
        return res.status(200).json({
          ...normalized,
          lastUpdated: normalized.lastUpdated ?? new Date().toISOString(),
          cache: { hit: true, stale: true },
          warning: "Quota atingida, mostrando cache anterior.",
        });
      }

      if (isQuotaError(msg)) {
        return res.status(429).json({
          code: "QUOTA_EXCEEDED",
          message: "Limite Gemini atingido",
          details: msg,
        });
      }

      return res.status(500).json({
        code: "GEMINI_ERROR",
        message: "Erro ao gerar análise.",
        details: msg,
        predictions: [], // evita crash no frontend
      });
    }
  } catch (e: any) {
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: "Erro interno.",
      details: String(e?.message ?? "Server error"),
      predictions: [], // evita crash no frontend
    });
  }
}
