import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_redis.js";

export const config = { runtime: "nodejs" };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {

    let cursor = "0";
    const out: Record<string, any> = {};

    do {

      const result = await redis.scan(cursor, "nhl:manual:*", 100);
      const nextCursor = result[0];
      const keys = result[1] || [];

      for (const key of keys) {

        const date = key.replace("nhl:manual:", "");
        const raw = await redis.get(key);

        if (!raw) continue;

        try {
          out[date] = JSON.parse(raw);
        } catch {}

      }

      cursor = nextCursor;

    } while (cursor !== "0");

    return res.status(200).json({
      ok: true,
      items: out
    });

  } catch (e:any) {

    return res.status(500).json({
      message: "manual-all error",
      details: String(e?.message || e)
    });

  }
}
