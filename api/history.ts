import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedis } from "./_redis";

export const config = { runtime: "nodejs" };

type Suggestions = any;
type HistorySide = "auto" | "mine";

type StoreItem = {
  date: string;
  auto: null | { savedAt: number; suggestions: Suggestions };
  mine: null | { savedAt: number; suggestions: Suggestions };
};

const KEY_PREFIX = "history:";

const keyForDate = (date: string) => `${KEY_PREFIX}${date}`;

function isDate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

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

function asInt(x: any, def: number) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const redis = await getRedis();
    if (!redis) return res.status(500).json({ message: "REDIS_URL não definida." });

    if (req.method === "GET") {
      const limit = asInt(req.query.limit, 120);

      const keys = await redis.keys(`${KEY_PREFIX}*`);
      const dates = (keys || [])
        .map(String)
        .filter((k) => k.startsWith(KEY_PREFIX))
        .map((k) => k.slice(KEY_PREFIX.length))
        .sort((a, b) => (a < b ? 1 : -1))
        .slice(0, limit);

      const items: StoreItem[] = [];
      for (const date of dates) {
        const raw = await redis.get(keyForDate(date));
        const parsed = safeJsonParse(raw);
        if (parsed) items.push(parsed);
      }

      return res.status(200).json({ items });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

      const date = String(body.date || "").trim();
      if (!date || !isDate(date)) return res.status(400).json({ message: "Invalid date" });

      // compat 1: { date, side:"auto"|"mine", suggestions }
      const side: HistorySide | undefined = body.side === "auto" || body.side === "mine" ? body.side : undefined;
      const suggestions = body.suggestions ?? undefined;

      // compat 2: { date, auto:{...} } / { date, mine:{...} }
      const autoObj = body.auto ?? undefined;
      const mineObj = body.mine ?? undefined;

      // compat 3: { date, picks } (antigo)
      const picks = body.picks ?? undefined;

      // load existing
      const existingRaw = await redis.get(keyForDate(date));
      const existingParsed = safeJsonParse(existingRaw);

      const existing: StoreItem = existingParsed ?? { date, auto: null, mine: null };

      // merge
      if (autoObj) existing.auto = autoObj;
      if (mineObj) existing.mine = mineObj;

      if (side && suggestions) {
        existing[side] = { savedAt: Date.now(), suggestions };
      }

      if (picks && !side && !mineObj) {
        existing.mine = { savedAt: Date.now(), suggestions: picks };
      }

      await redis.set(keyForDate(date), JSON.stringify(existing));

      return res.status(200).json({ ok: true, item: existing });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  } catch (e: any) {
    return res.status(500).json({ message: "Server error", details: String(e?.message || e) });
  }
}import type { NextApiRequest, NextApiResponse } from "next";
import { getRedis } from "./_redis";

type Suggestions = any;
type HistorySide = "auto" | "mine";

type StoreItem = {
  date: string;
  auto: null | { savedAt: number; suggestions: Suggestions };
  mine: null | { savedAt: number; suggestions: Suggestions };
};

const KEY_PREFIX = "history:";

let memoryStore: Record<string, StoreItem> = {};

const keyForDate = (date: string) => `${KEY_PREFIX}${date}`;

const asDateString = (x: any) => String(x || "").trim();

const toInt = (x: any, def: number) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
};

async function loadItem(date: string): Promise<StoreItem | null> {
  const r = await getRedis();
  if (r) {
    const raw = await r.get(keyForDate(date));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoreItem;
    } catch {
      return null;
    }
  }
  return memoryStore[date] ?? null;
}

async function saveItem(item: StoreItem): Promise<void> {
  const r = await getRedis();
  if (r) {
    await r.set(keyForDate(item.date), JSON.stringify(item));
    return;
  }
  memoryStore[item.date] = item;
}

async function listDates(): Promise<string[]> {
  const r = await getRedis();
  if (r) {
    const keys = await r.keys(`${KEY_PREFIX}*`);
    return (keys || [])
      .map(String)
      .filter((k) => k.startsWith(KEY_PREFIX))
      .map((k) => k.slice(KEY_PREFIX.length));
  }
  return Object.keys(memoryStore);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const limit = toInt(req.query.limit, 120);

      const dates = await listDates();
      dates.sort((a, b) => (a < b ? 1 : -1));

      const items: StoreItem[] = [];
      for (const d of dates.slice(0, limit)) {
        const item = await loadItem(d);
        if (item) items.push(item);
      }

      return res.status(200).json({ items });
    }

    if (req.method === "POST") {
      const body = req.body || {};

      const date = asDateString(body.date);
      if (!date) return res.status(400).json({ error: "Missing date" });

      // compat 1 (App.tsx): { date, side: "auto"|"mine", suggestions }
      const side: HistorySide | undefined = body.side === "auto" || body.side === "mine" ? body.side : undefined;
      const suggestions = body.suggestions ?? undefined;

      // compat 2: { date, auto: {savedAt, suggestions} } / { date, mine: {...} }
      const autoObj = body.auto ?? undefined;
      const mineObj = body.mine ?? undefined;

      // compat 3 (antigo): { date, picks } => assume mine
      const picks = body.picks ?? undefined;

      let existing: StoreItem = (await loadItem(date)) ?? { date, auto: null, mine: null };

      // merge (não apaga o outro lado)
      if (autoObj) existing.auto = autoObj;
      if (mineObj) existing.mine = mineObj;

      if (side && suggestions) {
        existing[side] = { savedAt: Date.now(), suggestions };
      }

      if (picks && !mineObj && !side) {
        existing.mine = { savedAt: Date.now(), suggestions: picks };
      }

      await saveItem(existing);

      return res.status(200).json({ ok: true, item: existing });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}
