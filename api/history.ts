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

function cleanSuggestionLabel(value: any): string {
  let s = String(value ?? "").trim();
  if (!s) return s;

  const m = s.match(/^\s*\d+\s*\(([^)]+)\)\s*$/);
  if (m?.[1]) return m[1].trim();

  s = s.replace(/^\s*\d+\s+/, "").trim();

  const p = s.match(/^\(([^)]+)\)$/);
  if (p?.[1]) return p[1].trim();

  return s;
}

function normalizeSuggestionsDeep(input: any) {
  if (!input || typeof input !== "object") return input;

  const out: any = Array.isArray(input) ? [...input] : { ...input };

  const normalizeStringArray = (arr: any) =>
    Array.isArray(arr)
      ? arr.map(cleanSuggestionLabel).filter((x) => String(x).trim().length > 0)
      : [];

  if ("tripleWin" in out) out.tripleWin = normalizeStringArray(out.tripleWin);
  if ("tripleOver15P1" in out) out.tripleOver15P1 = normalizeStringArray(out.tripleOver15P1);
  if ("doubleOver15P1" in out) out.doubleOver15P1 = normalizeStringArray(out.doubleOver15P1);
  if ("quadrupleOver45" in out) out.quadrupleOver45 = normalizeStringArray(out.quadrupleOver45);
  if ("over55Suggestions" in out) out.over55Suggestions = normalizeStringArray(out.over55Suggestions);

  if ("drawSuggestions" in out) {
    out.drawSuggestions = Array.isArray(out.drawSuggestions)
      ? out.drawSuggestions.map((d: any) => ({
          game: cleanSuggestionLabel(d?.game),
          explanation: String(d?.explanation ?? ""),
        }))
      : [];
  }

  return out;
}

function normalizeSideObject(obj: any) {
  if (!obj || typeof obj !== "object") return obj;

  const savedAt = Number(obj.savedAt);
  const suggestions = normalizeSuggestionsDeep(obj.suggestions);

  return {
    savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
    suggestions,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
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

      const suggestionsRaw = (body as any)?.suggestions ?? undefined;
      const autoObj = (body as any)?.auto ?? undefined;
      const mineObj = (body as any)?.mine ?? undefined;
      const picks = (body as any)?.picks ?? undefined;

      let existing: StoreItem = { date, auto: null, mine: null };

      try {
        const existingRaw = await redis.get(keyForDate(date));
        const existingParsed = safeJsonParse(existingRaw);
        if (existingParsed && typeof existingParsed === "object") {
          existing = existingParsed as StoreItem;
        }
      } catch {}

      if (autoObj) existing.auto = normalizeSideObject(autoObj);
      if (mineObj) existing.mine = normalizeSideObject(mineObj);

      if (side && suggestionsRaw) {
        existing[side] = {
          savedAt: Date.now(),
          suggestions: normalizeSuggestionsDeep(suggestionsRaw),
        };
      }

      if (picks && !side && !mineObj) {
        existing.mine = {
          savedAt: Date.now(),
          suggestions: normalizeSuggestionsDeep(picks),
        };
      }

      await redis.set(keyForDate(date), JSON.stringify(existing));

      return res.status(200).json({
        ok: true,
        item: existing,
      });
    }

    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        items: [],
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
