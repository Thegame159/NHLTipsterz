import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedis } from "./_redis";

export const config = { runtime: "nodejs" };

function isDate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

const keyIndex = () => "nhl:history:dates"; // ZSET member=date score=timestamp
const keyAuto = (date: string) => `nhl:history:auto:${date}`;
const keyMine = (date: string) => `nhl:history:mine:${date}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const redis = await getRedis();
    if (!redis) return res.status(500).json({ message: "REDIS_URL não definida." });

    if (req.method === "GET") {
      const date = String(req.query.date || "").trim();
      const limit = Math.max(1, Math.min(200, Number(req.query.limit || 60)));

      if (date) {
        if (!isDate(date)) return res.status(400).json({ message: "Invalid date" });

        const [autoRaw, mineRaw] = await Promise.all([redis.get(keyAuto(date)), redis.get(keyMine(date))]);

        return res.status(200).json({
          date,
          auto: autoRaw ? JSON.parse(autoRaw) : null,
          mine: mineRaw ? JSON.parse(mineRaw) : null,
        });
      }

      const dates = (await redis.zRange(keyIndex(), 0, limit - 1, { REV: true })) as string[];

      const items: any[] = [];
      for (const d of dates) {
        const [autoRaw, mineRaw] = await Promise.all([redis.get(keyAuto(d)), redis.get(keyMine(d))]);
        items.push({
          date: d,
          auto: autoRaw ? JSON.parse(autoRaw) : null,
          mine: mineRaw ? JSON.parse(mineRaw) : null,
        });
      }

      return res.status(200).json({ items });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const date = String(body?.date || "").trim();
      const side = String(body?.side || "").trim(); // auto | mine
      const suggestions = body?.suggestions;

      if (!date || !isDate(date)) return res.status(400).json({ message: "Invalid date" });
      if (side !== "auto" && side !== "mine") return res.status(400).json({ message: "Invalid side (auto|mine)" });
      if (!suggestions || typeof suggestions !== "object") return res.status(400).json({ message: "Invalid suggestions" });

      const payload = JSON.stringify({ savedAt: Date.now(), suggestions });

      if (side === "auto") await redis.set(keyAuto(date), payload);
      else await redis.set(keyMine(date), payload);

      await redis.zAdd(keyIndex(), [{ score: Date.now(), value: date }]);

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  } catch (e: any) {
    return res.status(500).json({ message: "Server error", details: String(e?.message || e) });
  }
}import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedis } from "./_redis";

export const config = { runtime: "nodejs" };

function isDate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function json(res: VercelResponse, status: number, body: any) {
  return res.status(status).json(body);
}

const keyIndex = () => "nhl:history:dates"; // ZSET: member=date score=ts
const keyAuto = (date: string) => `nhl:history:auto:${date}`;
const keyMine = (date: string) => `nhl:history:mine:${date}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const redis = await getRedis();
    if (!redis) return json(res, 500, { message: "REDIS_URL não definida." });

    if (req.method === "GET") {
      const date = String(req.query.date || "").trim();
      const limit = Math.max(1, Math.min(200, Number(req.query.limit || 60)));

      // ✅ GET específico de uma data
      if (date) {
        if (!isDate(date)) return json(res, 400, { message: "Invalid date" });

        const [autoRaw, mineRaw] = await Promise.all([
          redis.get(keyAuto(date)),
          redis.get(keyMine(date)),
        ]);

        return json(res, 200, {
          date,
          auto: autoRaw ? JSON.parse(autoRaw) : null,
          mine: mineRaw ? JSON.parse(mineRaw) : null,
        });
      }

      // ✅ GET lista
      const dates = (await redis.zRange(keyIndex(), 0, limit - 1, { REV: true })) as string[];

      const items: any[] = [];
      for (const d of dates) {
        const [autoRaw, mineRaw] = await Promise.all([
          redis.get(keyAuto(d)),
          redis.get(keyMine(d)),
        ]);

        items.push({
          date: d,
          auto: autoRaw ? JSON.parse(autoRaw) : null,
          mine: mineRaw ? JSON.parse(mineRaw) : null,
        });
      }

      return json(res, 200, { items });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const date = String(body?.date || "").trim();
      const side = String(body?.side || "").trim(); // "auto" | "mine"
      const suggestions = body?.suggestions;

      if (!date || !isDate(date)) return json(res, 400, { message: "Invalid date" });
      if (side !== "auto" && side !== "mine") return json(res, 400, { message: "Invalid side (auto|mine)" });
      if (!suggestions || typeof suggestions !== "object") return json(res, 400, { message: "Invalid suggestions" });

      const payload = JSON.stringify({ savedAt: Date.now(), suggestions });

      if (side === "auto") await redis.set(keyAuto(date), payload);
      else await redis.set(keyMine(date), payload);

      // adiciona ao índice
      await redis.zAdd(keyIndex(), [{ score: Date.now(), value: date }]);

      return json(res, 200, { ok: true });
    }

    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { message: "Method not allowed" });
  } catch (e: any) {
    return json(res, 500, { message: "Server error", details: String(e?.message || e) });
  }
}
