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

function normalizeSideObject(obj: any) {
  if (!obj || typeof obj !== "object") return obj;

  const savedAt = Number(obj.savedAt);

  return {
    savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
    suggestions: obj.suggestions ?? null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // =========================
    // POST
    // =========================
    if (req.method === "POST") {
      const body =
        typeof req.body === "string"
          ? safeJsonParse(req.body)
          : req.body || {};

      if (!body || typeof body !== "object") {
        return res.status(400).json({ message: "Invalid JSON body" });
      }

      const date = String((body as any)?.date || "").trim();
      if (!date || !isDate(date)) {
        return res.status(400).json({ message: "Invalid date" });
      }

      const side: HistorySide | undefined =
        (body as any)?.side === "auto" || (body as any)?.side === "mine"
          ? (body as any).side
          : undefined;

      let existing: StoreItem = { date, auto: null, mine: null };

      try {
        const raw = await redis.get(keyForDate(date));
        const parsed = safeJsonParse(raw);
        if (parsed && typeof parsed === "object") {
          existing = parsed as StoreItem;
        }
      } catch {}

      if (side && (body as any)?.suggestions) {
        existing[side] = {
          savedAt: Date.now(),
          suggestions: (body as any).suggestions,
        };
      }

      if ((body as any)?.auto) existing.auto = normalizeSideObject((body as any).auto);
      if ((body as any)?.mine) existing.mine = normalizeSideObject((body as any).mine);

      await redis.set(keyForDate(date), JSON.stringify(existing));

      return res.status(200).json({ ok: true, item: existing });
    }

    // =========================
    // GET (Upstash-safe usando SCAN)
    // =========================
    if (req.method === "GET") {
      const limitRaw = String(req.query.limit || "30");
      const limit = Math.min(parseInt(limitRaw, 10) || 30, 200);

      const keys: string[] = [];
      let cursor = 0;

      // SCAN loop
      do {
        const result = await redis.scan(cursor, {
          match: `${KEY_PREFIX}*`,
          count: 100,
        });

        cursor = Number(result[0]);
        keys.push(...result[1]);
      } while (cursor !== 0);

      const dates = keys
        .map((k) => k.replace(KEY_PREFIX, ""))
        .filter(isDate)
        .sort((a, b) => (a < b ? 1 : -1))
        .slice(0, limit);

      const items: StoreItem[] = [];

      for (const date of dates) {
        try {
          const raw = await redis.get(keyForDate(date));
          const parsed = safeJsonParse(raw);
          if (parsed) items.push(parsed);
        } catch {}
      }

      return res.status(200).json({
        ok: true,
        items,
      });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  } catch (e: any) {
    return res.status(500).json({
      message: "History fatal",
      details: String(e?.message || e),
    });
  }
}
