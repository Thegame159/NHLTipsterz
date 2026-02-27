import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_redis.js";

export const config = { runtime: "nodejs" };

type Suggestions = any;
type HistorySide = "auto" | "mine";

type StoreItem = {
  date: string;
  auto: null | { savedAt: number; suggestions: Suggestions };
  mine: null | { savedAt: number; suggestions: Suggestions };
};

const KEY_PREFIX = "history:";
const INDEX_KEY = "history:index";

function isDate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

const keyForDate = (date: string) => `${KEY_PREFIX}${date}`;

function safeJsonParse(input: any) {
  try {
    const s = typeof input === "string" ? input : input?.toString?.() ?? "";
    if (!s) return null;
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function addToIndex(date: string) {
  await redis.sadd(INDEX_KEY, date);
}

async function removeFromIndex(date: string) {
  await redis.srem(INDEX_KEY, date);
}

async function getIndex(): Promise<string[]> {
  const dates = await redis.smembers(INDEX_KEY);
  return Array.isArray(dates) ? dates.filter(isDate) : [];
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {

    // =========================
    // DELETE
    // =========================
    if (req.method === "DELETE") {
      const date = String(req.query.date || "").trim();
      if (!date || !isDate(date)) {
        return res.status(400).json({ message: "Invalid date" });
      }

      await redis.del(keyForDate(date));
      await removeFromIndex(date);

      return res.status(200).json({ ok: true, deleted: date });
    }

    // =========================
    // POST
    // =========================
    if (req.method === "POST") {
      const body =
        typeof req.body === "string"
          ? safeJsonParse(req.body)
          : req.body || {};

      const date = String((body as any)?.date || "").trim();
      if (!date || !isDate(date)) {
        return res.status(400).json({ message: "Invalid date" });
      }

      const side: HistorySide | undefined =
        (body as any)?.side === "auto" ||
        (body as any)?.side === "mine"
          ? (body as any).side
          : undefined;

      let existing: StoreItem = { date, auto: null, mine: null };

      const raw = await redis.get(keyForDate(date));
      const parsed = safeJsonParse(raw);
      if (parsed) existing = parsed;

      if (side && (body as any)?.suggestions) {
        existing[side] = {
          savedAt: Date.now(),
          suggestions: (body as any).suggestions,
        };
      }

      await redis.set(keyForDate(date), JSON.stringify(existing));
      await addToIndex(date);

      return res.status(200).json({ ok: true, item: existing });
    }

    // =========================
    // GET
    // =========================
    if (req.method === "GET") {
      const limitRaw = String(req.query.limit || "30");
      const limit = Math.min(parseInt(limitRaw, 10) || 30, 200);

      const allDates = await getIndex();

      const dates = allDates
        .sort((a, b) => (a < b ? 1 : -1))
        .slice(0, limit);

      const items: StoreItem[] = [];

      for (const date of dates) {
        const raw = await redis.get(keyForDate(date));
        const parsed = safeJsonParse(raw);
        if (parsed) items.push(parsed);
      }

      return res.status(200).json({ ok: true, items });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ message: "Method not allowed" });

  } catch (e: any) {
    return res.status(500).json({
      message: "History fatal",
      details: String(e?.message || e),
    });
  }
}
