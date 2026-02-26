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
    const s = typeof input === "string" ? input : input?.toString?.() ?? "";
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

function normalizeAnySuggestions(s: any) {
  try {
    return normalizeSuggestionsDeep(s);
  } catch {
    return s;
  }
}

function normalizeSideObject(obj: any) {
  if (!obj || typeof obj !== "object") return obj;
  const savedAt = Number(obj.savedAt);
  const suggestions = normalizeAnySuggestions(obj.suggestions);
  return {
    savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
    suggestions,
  };
}

async function scanKeys(redis: any, pattern: string, limit: number): Promise<string[]> {
  // node-redis v4 scan: scan(cursor, { MATCH, COUNT })
  let cursor = "0";
  const out: string[] = [];

  while (true) {
    const res = await redis.scan(cursor, { MATCH: pattern, COUNT: 200 });

    // compat: alguns retornam {cursor, keys}, outros [cursor, keys]
    cursor = (res?.cursor ?? res?.[0] ?? "0") as string;
    const keys: string[] = (res?.keys ?? res?.[1] ?? []).map(String);

    for (const k of keys) {
      out.push(k);
      if (out.length >= limit) return out;
    }

    if (cursor === "0") break;
  }

  return out;
}

function ok200(res: VercelResponse, payload: any) {
  return res.status(200).json(payload);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const redis = await getRedis();

    // 🔒 nunca crashar a app por Redis em baixo
    if (!redis) {
      if (req.method === "GET") return ok200(res, { items: [], ok: false, message: "Redis unavailable" });
      if (req.method === "POST") return ok200(res, { ok: false, message: "Redis unavailable" });
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ message: "Method not allowed" });
    }

    if (req.method === "GET") {
      const limit = asInt(req.query.limit, 120);

      let keys: string[] = [];
      try {
        keys = await scanKeys(redis, `${KEY_PREFIX}*`, Math.max(200, limit * 4));
      } catch (e: any) {
        // fallback: sem lista (mas sem crash)
        return ok200(res, { items: [], ok: false, message: "Redis scan failed", details: String(e?.message || e) });
      }

      const dates = keys
        .map(String)
        .filter((k) => k.startsWith(KEY_PREFIX))
        .map((k) => k.slice(KEY_PREFIX.length))
        .filter((d) => isDate(d))
        .sort((a, b) => (a < b ? 1 : -1))
        .slice(0, limit);

      const items: StoreItem[] = [];
      for (const date of dates) {
        try {
          const raw = await redis.get(keyForDate(date));
          const parsed = safeJsonParse(raw);
          if (parsed) items.push(parsed as StoreItem);
        } catch {
          // ignora item problemático
        }
      }

      return ok200(res, { items, ok: true });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
      if (!body || typeof body !== "object") return res.status(400).json({ message: "Invalid JSON body" });

      const date = String((body as any)?.date || "").trim();
      if (!date || !isDate(date)) return res.status(400).json({ message: "Invalid date" });

      // compat 1: { date, side:"auto"|"mine", suggestions }
      const side: HistorySide | undefined =
        (body as any)?.side === "auto" || (body as any)?.side === "mine" ? (body as any).side : undefined;
      const suggestionsRaw = (body as any)?.suggestions ?? undefined;

      // compat 2: { date, auto:{savedAt,suggestions} } / { date, mine:{...} }
      const autoObj = (body as any)?.auto ?? undefined;
      const mineObj = (body as any)?.mine ?? undefined;

      // compat 3 (antigo): { date, picks } => assume mine
      const picks = (body as any)?.picks ?? undefined;

      // load existing
      let existing: StoreItem = { date, auto: null, mine: null };
      try {
        const existingRaw = await redis.get(keyForDate(date));
        const existingParsed = safeJsonParse(existingRaw);
        if (existingParsed && typeof existingParsed === "object") existing = existingParsed as StoreItem;
      } catch {
        // ok
      }

      // merge (normalizando)
      if (autoObj) existing.auto = normalizeSideObject(autoObj);
      if (mineObj) existing.mine = normalizeSideObject(mineObj);

      if (side && suggestionsRaw) {
        const suggestions = normalizeAnySuggestions(suggestionsRaw);
        existing[side] = { savedAt: Date.now(), suggestions };
      }

      if (picks && !side && !mineObj) {
        const suggestions = normalizeAnySuggestions(picks);
        existing.mine = { savedAt: Date.now(), suggestions };
      }

      // guarda
      try {
        await redis.set(keyForDate(date), JSON.stringify(existing));
      } catch (e: any) {
        return ok200(res, { ok: false, message: "Redis set failed", details: String(e?.message || e) });
      }

      return ok200(res, { ok: true, item: existing });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  } catch (e: any) {
    // ✅ nunca mais FUNCTION_INVOCATION_FAILED aqui
    return ok200(res, { ok: false, message: "History fatal", details: String(e?.message || e) });
  }
}
