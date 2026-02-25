import type { NextApiRequest, NextApiResponse } from "next";

// IMPORTA O TEU REDIS
// ajusta se no teu projeto for default export etc.
import { redis } from "./_redis";

type Suggestions = any;

type HistorySide = "auto" | "mine";

type StoreItem = {
  date: string;
  auto: null | { savedAt: number; suggestions: Suggestions };
  mine: null | { savedAt: number; suggestions: Suggestions };
};

const KEY_PREFIX = "history:";

function keyForDate(date: string) {
  return `${KEY_PREFIX}${date}`;
}

function asDateString(x: any) {
  return String(x || "").trim();
}

function toInt(x: any, def: number) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

async function loadItem(date: string): Promise<StoreItem | null> {
  const raw = await redis.get(keyForDate(date));
  if (!raw) return null;

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as StoreItem;
    } catch {
      return null;
    }
  }
  return raw as StoreItem;
}

async function saveItem(item: StoreItem): Promise<void> {
  await redis.set(keyForDate(item.date), JSON.stringify(item));
}

async function listDates(): Promise<string[]> {
  const keys: string[] = await redis.keys(`${KEY_PREFIX}*`);
  return (keys || [])
    .map(String)
    .filter((k) => k.startsWith(KEY_PREFIX))
    .map((k) => k.slice(KEY_PREFIX.length));
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

      // compat 1: payload novo (App.tsx): { date, side: "auto"|"mine", suggestions }
      const side = (body.side as HistorySide | undefined) ?? undefined;
      const suggestions = body.suggestions ?? undefined;

      // compat 2: payload direto: { date, auto: {savedAt, suggestions} } / { date, mine: {...} }
      const autoObj = body.auto ?? undefined;
      const mineObj = body.mine ?? undefined;

      // compat 3: payload antigo: { date, picks } => assume mine
      const picks = body.picks ?? undefined;

      let existing: StoreItem = (await loadItem(date)) ?? { date, auto: null, mine: null };

      // aplica updates (merge, não apaga o outro lado)
      if (autoObj) {
        existing.auto = autoObj;
      }
      if (mineObj) {
        existing.mine = mineObj;
      }

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
