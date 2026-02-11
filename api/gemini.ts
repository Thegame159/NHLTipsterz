import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "redis";

export const config = {
  runtime: "nodejs",
};

// 24h
const TTL_MS = 1000 * 60 * 60 * 24;

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res
        .status(405)
        .json({ code: "METHOD_NOT_ALLOWED", message: "Use POST." });
    }

    // ⚠️ O nome na Vercel está como GEMINI_API_KEY (no teu print)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        code: "MISSING_GEMINI_API_KEY",
        message: "GEMINI_API_KEY não definida nas Environment Variables da Vercel.",
      });
    }

    // Em Vercel Functions (não-Next), o body pode vir como string
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});

    const { selectedDate } = body;
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
          cachedEntry = JSON.parse(cachedRaw);
          const age = now - cachedEntry.lastUpdated;
          if (age < TTL_MS) {
            return res.status(200).json({
              ...cachedEntry.data,
              cache: { hit: true, ageMs: age },
            });
          }
        }
      } catch (e: any) {
        // Se cache falhar, continua sem cache
        console.error("Redis get failed:", e?.message ?? e);
      }
    }

    // --- GEMINI ---
    try {
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
Analise os jogos da NHL que ocorrerão na data: ${selectedDate}.
Gere probabilidades e sugestões estratégicas conforme especificado no código anterior.
`.trim();

      const response = await ai.models.generateContent({
        // se este modelo falhar, troca para "gemini-1.5-flash"
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          // Se isto der erro em produção, comenta esta linha:
          // tools: [{ googleSearch: {} }],

          responseMimeType: "application/json",
          responseSchema: { type: Type.OBJECT },
        },
      });

      const result = JSON.parse(response.text || "{}");
      const payload = { ...result, lastUpdated: new Date().toISOString() };

      // --- Guarda cache ---
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

      // Se quota e tem cache velho, devolve cache stale
      if (isQuotaError(msg) && cachedEntry) {
        return res.status(200).json({
          ...cachedEntry.data,
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
      });
    }
  } catch (e: any) {
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: "Erro interno.",
      details: String(e?.message ?? "Server error"),
    });
  }
}
