import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedis } from "./_redis";
import { normalizeSuggestionsDeep } from "../services/normalizeSuggestionLabel";

export const config = { runtime: "nodejs" };

function isDate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

const keyManual = (date: string) => `nhl:manual:${date}`;

function safeJsonParse(raw: any) {
  if (!raw) return null;
  try {
    const s = typeof raw === "string" ? raw : raw.toString?.();
    if (!s) return null;
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function normalizeStore(store: any) {
  // store pode ser "Suggestions" puro ou wrapper; normalizeSuggestionsDeep lida com ambos
  try {
    return normalizeSuggestionsDeep(store);
  } catch {
    return store;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const redis = await getRedis();
    if (!redis) return res.status(500).json({ message: "REDIS_URL não definida." });

    const date = String(req.query.date || "").trim();
    if (!date || !isDate(date)) return res.status(400).json({ message: "Invalid date" });

    if (req.method === "GET") {
      const raw = await redis.get(keyManual(date));
      const parsed = safeJsonParse(raw);
      const normalized = parsed ? normalizeStore(parsed) : null;
      return res.status(200).json({ date, store: normalized });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const store = body?.store;

      if (!store || typeof store !== "object") {
        return res.status(400).json({ message: "Invalid store" });
      }

      const normalizedStore = normalizeStore(store);

      await redis.set(keyManual(date), JSON.stringify(normalizedStore));
      return res.status(200).json({ ok: true, store: normalizedStore });
    }

    if (req.method === "DELETE") {
      await redis.del(keyManual(date));
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ message: "Method not allowed" });
  } catch (e: any) {
    return res.status(500).json({ message: "Server error", details: String(e?.message || e) });
  }
}
