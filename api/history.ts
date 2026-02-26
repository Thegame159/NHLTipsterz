import type { VercelRequest, VercelResponse } from "@vercel/node";

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

function ok(res: VercelResponse, payload: any) {
  return res.status(200).json(payload);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ✅ NUNCA deixar crashar antes de responder JSON
  try {
    // --- dynamic imports (captura erros de import) ---
    let getRedis: (() => Promise<any | null>) | null = null;
    try {
      const mod = await import("./_redis");
      getRedis = (mod as any).getRedis;
      if (typeof getRedis !== "function") throw new Error("getRedis not exported");
    } catch (e: any) {
      return ok(res, {
        ok: false,
        message: "history: failed to import ./_redis",
        details: String(e?.message ?? e),
      });
    }

    let normalizeSuggestionsDeep: ((x: any) => any) | null = null;
    try {
      const mod = await import("./_suggestions");
      normalizeSuggestionsDeep = (mod as any).normalizeSuggestionsDeep;
      if (typeof normalizeSuggestionsDeep !== "function") throw new Error("normalizeSuggestionsDeep not exported");
    } catch (e: any) {
      // normalização é “nice to have” — não bloqueia endpoint
      normalizeSuggestionsDeep = null;
    }

    const redis = await getRedis();
    if (!redis) {
      // não crasha o frontend — devolve 200 com ok:false
      if (req.method === "GET") return ok(res, { ok: false, items: [], message: "Redis unavailable" });
      if (req.method === "POST") return ok(res, { ok: false, message: "Redis unavailable" });
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ message: "Method not allowed" });
    }

    // ---------------- GET ----------------
    if (req.method === "GET") {
      const limit = asInt((req.query as any).limit, 120);

      // ✅ sem SCAN/KEYS para já (zero risco de incompatibilidade)
      // Se precisares mesmo da listagem, eu reintroduzo SCAN depois de estabilizar.
      // Neste momento o importante é o POST funcionar (o que está a rebentar a UI).
      return ok(res, { ok: true, items: [], note: "GET list disabled temporarily", limit });
    }

    // ---------------- POST ----------------
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
        // ignore
      }

      const norm = (x: any) => (normalizeSuggestionsDeep ? normalizeSuggestionsDeep(x) : x);

      // merge
      if (autoObj) {
        existing.auto = {
          savedAt: Number.isFinite(Number(autoObj.savedAt)) ? Number(autoObj.savedAt) : Date.now(),
          suggestions: norm(autoObj.suggestions),
        };
      }

      if (mineObj) {
        existing.mine = {
          savedAt: Number.isFinite(Number(mineObj.savedAt)) ? Number(mineObj.savedAt) : Date.now(),
          suggestions: norm(mineObj.suggestions),
        };
      }

      if (side && suggestionsRaw) {
        existing[side] = { savedAt: Date.now(), suggestions: norm(suggestionsRaw) };
      }

      if (picks && !side && !mineObj) {
        existing.mine = { savedAt: Date.now(), suggestions: norm(picks) };
      }

      try {
        await redis.set(keyForDate(date), JSON.stringify(existing));
      } catch (e: any) {
        return ok(res, { ok: false, message: "Redis set failed", details: String(e?.message ?? e) });
      }

      return ok(res, { ok: true, item: existing });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  } catch (e: any) {
    // ✅ nunca mais FUNCTION_INVOCATION_FAILED
    return ok(res, { ok: false, message: "History fatal", details: String(e?.message ?? e) });
  }
}
