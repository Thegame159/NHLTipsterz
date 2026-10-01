import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_redis.js";

export const config = { runtime: "nodejs" };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    let cursor: string | number = "0";
    const out: Record<string, any> = {};

    do {
      // Passa as opções em formato de objeto (padrão Upstash)
      const result = await redis.scan(cursor, { match: "nhl:manual:*", count: 100 });

      // Validação de segurança: se result for null/undefined, aborta o loop em segurança
      if (!result || !Array.isArray(result)) {
        break;
      }

      const nextCursor = result[0] ?? "0";
      const keys = Array.isArray(result[1]) ? result[1] : [];

      for (const key of keys) {
        if (!key) continue;

        const date = key.replace("nhl:manual:", "");
        const raw = await redis.get(key);

        if (!raw) continue;

        try {
          out[date] = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          out[date] = raw;
        }
      }

      cursor = nextCursor;

    } while (cursor !== "0" && cursor !== 0);

    return res.status(200).json({
      ok: true,
      items: out
    });

  } catch (e: any) {
    return res.status(500).json({
      message: "manual-all error",
      details: String(e?.message || e)
    });
  }
}
