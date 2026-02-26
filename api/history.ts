import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedis } from "./_redis";
import { normalizeSuggestionsDeep } from "./_suggestions";

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
    const s =
      typeof input === "string"
        ? input
        : input?.toString?.()
        ? input.toString()
        : "";
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

function normalizeHistoryPayloadSuggestions(suggestions: any) {
  try {
    return normalizeSuggestionsDeep(suggestions);
  } catch {
    return suggestions;
  }
}

function normalizeSideObject(obj: any) {
  if (!obj || typeof obj !== "object") return obj;
  const savedAt = Number(obj.savedAt);
  const suggestions = normalizeHistoryPayloadSuggestions(obj.suggestions);
  return {
    savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
    suggestions,
  };
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
        if (parsed) items.push(parsed as StoreItem);
      }

      return res.status(200).json({ items });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};

      const date = String(body?.date || "").trim();
      if (!date || !isDate(date)) return res.status(400).json({ message: "Invalid date" });

      const side: HistorySide | undefined = body?.side === "auto" || body?.side === "mine" ? body.side : undefined;
      const suggestionsRaw = body?.suggestions ?? undefined;

      const autoObj = body?.auto ?? undefined;
      const mineObj = body?.mine ?? undefined;

      const picks = body?.picks ?? undefined;

      const existingRaw = await redis.get(keyForDate(date));
      const existingParsed = safeJsonParse(existingRaw);

      const existing: StoreItem = existingParsed ?? { date, auto: null, mine: null };

      if (autoObj) existing.auto = normalizeSideObject(autoObj);
      if (mineObj) existing.mine = normalizeSideObject(mineObj);

      if (side && suggestionsRaw) {
        const suggestions = normalizeHistoryPayloadSuggestions(suggestionsRaw);
        existing[side] = { savedAt: Date.now(), suggestions };
      }

      if (picks && !side && !mineObj) {
        const suggestions = normalizeHistoryPayloadSuggestions(picks);
        existing.mine = { savedAt: Date.now(), suggestions };
      }

      await redis.set(keyForDate(date), JSON.stringify(existing));
      return res.status(200).json({ ok: true, item: existing });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  } catch (e: any) {
    return res.status(500).json({ message: "Server error", details: String(e?.message || e) });
  }
}import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedis } from "./_redis";
import { normalizeSuggestionsDeep } from "../services/normalizeSuggestionLabel";

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
    const s =
      typeof input === "string"
        ? input
        : input?.toString?.()
        ? input.toString()
        : "";
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

function normalizeHistoryPayloadSuggestions(suggestions: any) {
  // Aceita tanto "Suggestions" puro como wrapper { suggestions: ... }
  try {
    return normalizeSuggestionsDeep(suggestions);
  } catch {
    return suggestions;
  }
}

function normalizeSideObject(obj: any) {
  if (!obj || typeof obj !== "object") return obj;
  const savedAt = Number(obj.savedAt);
  const suggestions = normalizeHistoryPayloadSuggestions(obj.suggestions);
  return {
    savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
    suggestions,
  };
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
        if (parsed) items.push(parsed as StoreItem);
      }

      return res.status(200).json({ items });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};

      const date = String(body?.date || "").trim();
      if (!date || !isDate(date)) return res.status(400).json({ message: "Invalid date" });

      // compat 1 (App.tsx): { date, side:"auto"|"mine", suggestions }
      const side: HistorySide | undefined = body?.side === "auto" || body?.side === "mine" ? body.side : undefined;
      const suggestionsRaw = body?.suggestions ?? undefined;

      // compat 2: { date, auto:{savedAt,suggestions} } / { date, mine:{...} }
      const autoObj = body?.auto ?? undefined;
      const mineObj = body?.mine ?? undefined;

      // compat 3 (antigo): { date, picks } => assume mine
      const picks = body?.picks ?? undefined;

      // load existing
      const existingRaw = await redis.get(keyForDate(date));
      const existingParsed = safeJsonParse(existingRaw);

      const existing: StoreItem = existingParsed ?? { date, auto: null, mine: null };

      // merge (com normalização)
      if (autoObj) existing.auto = normalizeSideObject(autoObj);
      if (mineObj) existing.mine = normalizeSideObject(mineObj);

      if (side && suggestionsRaw) {
        const suggestions = normalizeHistoryPayloadSuggestions(suggestionsRaw);
        existing[side] = { savedAt: Date.now(), suggestions };
      }

      if (picks && !side && !mineObj) {
        const suggestions = normalizeHistoryPayloadSuggestions(picks);
        existing.mine = { savedAt: Date.now(), suggestions };
      }

      await redis.set(keyForDate(date), JSON.stringify(existing));

      return res.status(200).json({ ok: true, item: existing });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  } catch (e: any) {
    return res.status(500).json({ message: "Server error", details: String(e?.message || e) });
  }
}
