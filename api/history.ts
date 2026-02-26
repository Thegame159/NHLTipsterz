import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_redis";
import { normalizeSuggestionsDeep } from "./_suggestions";

export const config = { runtime: "nodejs" };

const KEY_PREFIX = "history:";

function isDate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

const keyForDate = (date: string) => `${KEY_PREFIX}${date}`;

function safeJsonParse(input: any) {
  try {
    return typeof input === "string" ? JSON.parse(input) : null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const date = body?.date;

      if (!date || !isDate(date)) {
        return res.status(400).json({ message: "Invalid date" });
      }

      const existingRaw = await redis.get(keyForDate(date));
      const existing = safeJsonParse(existingRaw) || { date, auto: null, mine: null };

      // compat 1: { date, side:"auto"|"mine", suggestions }
      if (body.side && body.suggestions) {
        existing[body.side] = {
          savedAt: Date.now(),
          suggestions: normalizeSuggestionsDeep(body.suggestions),
        };
      }

      // compat 2: { date, auto:{...} } / { date, mine:{...} }
      if (body.auto) {
        existing.auto = {
          savedAt: Number.isFinite(Number(body.auto.savedAt)) ? Number(body.auto.savedAt) : Date.now(),
          suggestions: normalizeSuggestionsDeep(body.auto.suggestions),
        };
      }
      if (body.mine) {
        existing.mine = {
          savedAt: Number.isFinite(Number(body.mine.savedAt)) ? Number(body.mine.savedAt) : Date.now(),
          suggestions: normalizeSuggestionsDeep(body.mine.suggestions),
        };
      }

      // compat 3 antigo: { date, picks } assume mine
      if (body.picks && !body.mine && !body.side) {
        existing.mine = {
          savedAt: Date.now(),
          suggestions: normalizeSuggestionsDeep(body.picks),
        };
      }

      await redis.set(keyForDate(date), JSON.stringify(existing));
      return res.status(200).json({ ok: true, item: existing });
    }

    if (req.method === "GET") {
      // opcional: implementar listagem via SCAN mais tarde
      return res.status(200).json({ ok: true, items: [] });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (e: any) {
    return res.status(500).json({
      message: "History fatal",
      details: String(e?.message || e),
    });
  }
}
