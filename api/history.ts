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
    // GET (MODO DIAGNÓSTICO)
    // =========================
    if (req.method === "GET") {
      let rawKeys: string[] = [];
      try {
        // Toca em tudo para ver o que existe na base de dados
        const result = await (redis as any).keys("*");
        if (Array.isArray(result)) {
          rawKeys = result;
        }
      } catch (err) {
        console.error(`[DIAGNOSTIC] Error fetching all keys:`, err);
      }

      console.log(`[DIAGNOSTIC] All keys found in Redis:`, rawKeys);

      // Filtra e reconstrói os items
      const items: StoreItem[] = [];
      for (const k of rawKeys) {
        if (String(k).startsWith(KEY_PREFIX)) {
          try {
            const raw = await redis.get(k);
            const parsed = safeJsonParse(raw);
            if (parsed) items.push(parsed);
          } catch {}
        }
      }

      // Devolve também as chaves brutas no JSON para veres na consola de rede do browser!
      return res.status(200).json({
        ok: true,
        diagnosticKeys: rawKeys,
        items
      });
    }

    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed" });

  } catch (e: any) {
    console.error(`[HISTORY FATAL]`, e);
    return res.status(500).json({
      message: "History fatal",
      details: String(e?.message || e),
    });
  }
}
