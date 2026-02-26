import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "redis";
import crypto from "crypto";
import { normalizeSuggestionsDeep } from "./_suggestions";

export const config = { runtime: "nodejs" };

// 🔐 GARANTE FETCH NO NODE (caso runtime não tenha)
if (!(global as any).fetch) {
  const fetch = (...args: any[]) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));
  (global as any).fetch = fetch;
}

// ---------------- CONFIG ----------------
const GEMINI_TTL_MS = 1000 * 60 * 60 * 12;
const RL_WINDOW_SEC = 600;
const RL_LIMIT = 30;

// ---------------- REDIS ----------------
let _redis: ReturnType<typeof createClient> | null = null;

async function getRedis() {
  if (_redis) return _redis;
  if (!process.env.REDIS_URL) return null;
  const client = createClient({ url: process.env.REDIS_URL });
  client.on("error", (err) => console.error("Redis error:", err));
  await client.connect();
  _redis = client;
  return _redis;
}

// ---------------- HELPERS ----------------
function safeJsonParse(input: any) {
  try {
    return JSON.parse(typeof input === "string" ? input : input?.toString?.() ?? "");
  } catch {
    return null;
  }
}

function jsonError(res: VercelResponse, status: number, message: string, details?: any) {
  return res.status(status).json({
    message,
    details,
    predictions: [],
    suggestions: {
      tripleWin: [],
      tripleOver15P1: [],
      doubleOver15P1: [],
      drawSuggestions: [],
      quadrupleOver45: [],
      over55Suggestions: [],
    },
    lastUpdated: new Date().toISOString(),
  });
}

function getClientIp(req: VercelRequest) {
  const xff = String(req.headers["x-forwarded-for"] || "");
  return xff.split(",")[0].trim() || "unknown";
}

async function rateLimit(redis: any, ip: string) {
  const key = `rl:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, RL_WINDOW_SEC);
  return count <= RL_LIMIT;
}

// ---------------- HANDLER ----------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return jsonError(res, 405, "Use POST");
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonError(res, 500, "GEMINI_API_KEY não definida");
    }

    const redis = await getRedis();

    if (redis) {
      const ip = getClientIp(req);
      const ok = await rateLimit(redis, ip);
      if (!ok) {
        return jsonError(res, 429, "Rate limit exceeded");
      }
    }

    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body;
    const selectedDate = body?.selectedDate;

    if (!selectedDate) {
      return jsonError(res, 400, "selectedDate obrigatório");
    }

    const cacheKey = `gemini:${selectedDate}`;
    let cached: any = null;

    if (redis) {
      const raw = await redis.get(cacheKey);
      if (raw) cached = safeJsonParse(raw);
    }

    if (cached) {
      return res.status(200).json(normalizeSuggestionsDeep(cached));
    }

    // 🔥 CHAMADA GEMINI PROTEGIDA
    let geminiData: any;

    try {
      const ai = new GoogleGenAI({ apiKey });

      const resp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Devolve JSON válido com predictions e suggestions para ${selectedDate}`,
        config: { responseMimeType: "application/json" },
      });

      geminiData = safeJsonParse(resp.text) ?? {};
    } catch (err: any) {
      console.error("Gemini error:", err);
      return jsonError(res, 500, "Erro ao chamar Gemini", String(err?.message ?? err));
    }

    const normalized = normalizeSuggestionsDeep(geminiData);

    if (redis) {
      await redis.set(cacheKey, JSON.stringify(normalized), { PX: GEMINI_TTL_MS });
    }

    return res.status(200).json(normalized);
  } catch (err: any) {
    console.error("FATAL ERROR:", err);
    return jsonError(res, 500, "Erro interno", String(err?.message ?? err));
  }
}
