import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedis } from "./_redis";

export const config = { runtime: "nodejs" };

function isDate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

const keyForDate = (date: string) => `history:${date}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const redis = await getRedis();

    if (!redis) {
      return res.status(200).json({
        ok: false,
        message: "Redis unavailable (fallback mode)",
      });
    }

    if (req.method === "GET") {
      return res.status(200).json({ items: [] });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const date = body?.date;

      if (!date || !isDate(date)) {
        return res.status(400).json({ message: "Invalid date" });
      }

      await redis.set(keyForDate(date), JSON.stringify(body));

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (err: any) {
    console.error("History fatal:", err);
    return res.status(500).json({
      message: "History fatal error",
      details: String(err?.message ?? err),
    });
  }
}
