import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_redis.js";

export const config = { runtime: "nodejs" };

type Suggestions = any;
type HistorySide = "auto" | "mine";

type StoreSide = {
  savedAt: number;
  suggestions: Suggestions | null;
  stats?: {
    correct: number;
    total: number;
    percent: number | null;
  };
  markets?: Record<string, any>;
};

type StoreItem = {
  date: string;
  auto: null | StoreSide;
  mine: null | StoreSide;
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

  try {
    // apagar histórico principal
    await redis.del(keyForDate(date));

    // apagar validações manuais
    await redis.del(`nhl:manual:${date}`);

  } catch (e: any) {
    return res.status(500).json({
      message: "History fatal",
      details: String(e?.message || e),
    });
  }

  return res.status(200).json({
    ok: true,
    deleted: date,
  });
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

const incomingSuggestions = (body as any)?.suggestions;
const incomingStats = (body as any)?.stats;
const incomingMarkets = (body as any)?.markets;

if (!side) {
  return res.status(400).json({ message: "Missing side" });
}

const currentSide = existing[side] ?? null;
existing[side] = {
  savedAt: currentSide?.savedAt ?? Date.now(),
  suggestions: incomingSuggestions ?? currentSide?.suggestions ?? null,
  stats: incomingStats ?? currentSide?.stats,
  markets: incomingMarkets ?? currentSide?.markets,
};
      await redis.set(keyForDate(date), JSON.stringify(existing));
     

      return res.status(200).json({ ok: true, item: existing });
    }
// =========================
// GET
// =========================
// =========================
// GET
// =========================
if (req.method === "GET") {
  const limitRaw = String(req.query.limit || "30");
  const limit = Math.min(parseInt(limitRaw, 10) || 30, 200);

  let cursor = "0";
  const keys: string[] = [];

  do {
    const result = await redis.scan(cursor, `${KEY_PREFIX}*`, 100);

    if (!result) break;

    const nextCursor = result[0];
    const foundKeys = Array.isArray(result[1]) ? result[1] : [];

    keys.push(...foundKeys);
    cursor = nextCursor;

  } while (cursor !== "0");

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
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ message: "Method not allowed" });

  } catch (e: any) {
    return res.status(500).json({
      message: "History fatal",
      details: String(e?.message || e),
    });
  }
}
