import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedis } from "./_redis";

export const config = { runtime: "nodejs" };

function isDate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function json(res: VercelResponse, status: number, body: any) {
  return res.status(status).json(body);
}

const keyManual = (date: string) => `nhl:manual:${date}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const redis = await getRedis();
    if (!redis) return json(res, 500, { message: "REDIS_URL não definida." });

    const date = String(req.query.date || "").trim();
    if (!date || !isDate(date)) return json(res, 400, { message: "Invalid date" });

    if (req.method === "GET") {
      const raw = await redis.get(keyManual(date));
      return json(res, 200, { date, store: raw ? JSON.parse(raw) : null });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const store = body?.store;

      if (!store || typeof store !== "object") return json(res, 400, { message: "Invalid store" });

      await redis.set(keyManual(date), JSON.stringify(store));
      return json(res, 200, { ok: true });
    }

    if (req.method === "DELETE") {
      await redis.del(keyManual(date));
      return json(res, 200, { ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return json(res, 405, { message: "Method not allowed" });
  } catch (e: any) {
    return json(res, 500, { message: "Server error", details: String(e?.message || e) });
  }
}
