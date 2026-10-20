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
      if (!date || !isDate(date)) return res.status(400).json({ message: "Invalid date" });

      await redis.del(keyForDate(date));
      await redis.del(`nhl:manual:${date}`);
      return res.status(200).json({ ok: true, deleted: date });
    }

    // =========================
    // POST (guardar snapshot / resultados de um lado: "auto" ou "mine")
    // =========================
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};

      const date = String((body as any)?.date || "").trim();
      if (!date || !isDate(date)) return res.status(400).json({ message: "Invalid date" });

      const side: HistorySide | undefined =
        (body as any)?.side === "auto" || (body as any)?.side === "mine" ? (body as any).side : undefined;
      if (!side) return res.status(400).json({ message: "Missing side" });

      let existing: StoreItem = { date, auto: null, mine: null };
      const targetKey = keyForDate(date);
      const parsed = safeJsonParse(await redis.get(targetKey));
      if (parsed) existing = { date, auto: parsed.auto ?? null, mine: parsed.mine ?? null };

      const incomingSuggestions = (body as any)?.suggestions;
      const incomingStats = (body as any)?.stats;
      const incomingMarkets = (body as any)?.markets;
      const currentSide = existing[side] ?? null;
      const suggestionsChanged = incomingSuggestions !== undefined;

      existing[side] = {
        savedAt: suggestionsChanged ? Date.now() : currentSide?.savedAt ?? Date.now(),
        suggestions: incomingSuggestions ?? currentSide?.suggestions ?? null,
        // novas dicas invalidam os resultados antigos
        stats: suggestionsChanged ? undefined : incomingStats ?? currentSide?.stats,
        markets: suggestionsChanged ? undefined : incomingMarkets ?? currentSide?.markets,
      };

      await redis.set(targetKey, JSON.stringify(existing));
      return res.status(200).json({ ok: true, item: existing });
    }

    // =========================
    // GET
    // =========================
    if (req.method === "GET") {
      const dateParam = String(req.query.date || "").trim();
      const sideParam = String(req.query.side || "").trim();

      // uma data + um lado → só as dicas guardadas
      if (dateParam && isDate(dateParam) && (sideParam === "mine" || sideParam === "auto")) {
        const parsed = safeJsonParse(await redis.get(keyForDate(dateParam)));
        return res.status(200).json({ ok: true, suggestions: parsed?.[sideParam]?.suggestions ?? null });
      }

      // lista dos últimos dias
      const limit = Math.min(parseInt(String(req.query.limit || "30"), 10) || 30, 200);

      let keys: string[] = [];
      try {
        keys = await redis.scanAll(`${KEY_PREFIX}*`);
      } catch (err) {
        console.error("[history] scan falhou:", err);
      }

      const dates = [...new Set(keys.map((k) => String(k).slice(KEY_PREFIX.length)).filter(isDate))]
        .sort((a, b) => (a < b ? 1 : -1))
        .slice(0, limit);

      const rows = await Promise.all(dates.map(async (date) => safeJsonParse(await redis.get(keyForDate(date)))));
      const items: StoreItem[] = rows.filter(Boolean) as StoreItem[];

      return res.status(200).json({ ok: true, items });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ message: "Method not allowed" });

  } catch (e: any) {
    console.error(`[HISTORY FATAL]`, e);
    return res.status(500).json({
      message: "History fatal",
      details: String(e?.message || e),
    });
  }
}
