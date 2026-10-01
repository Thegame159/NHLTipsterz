import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_redis.js";

export const config = { runtime: "nodejs" };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const out: Record<string, any> = {};

    let keys: string[] = [];
    try {
      // Uso de casting para garantir compatibilidade com o TypeScript na Vercel
      const resultKeys = await (redis as any).keys("nhl:manual:*");
      if (Array.isArray(resultKeys)) {
        keys = resultKeys;
      }
    } catch (err) {
      console.error(`[MANUAL-ALL] Error fetching keys:`, err);
    }

    for (const key of keys) {
      if (!key) continue;

      const date = String(key).replace("nhl:manual:", "");
      const raw = await redis.get(key);

      if (!raw) continue;

      try {
        out[date] = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        out[date] = raw;
      }
    }

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
