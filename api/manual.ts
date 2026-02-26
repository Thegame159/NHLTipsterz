import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_redis";

export const config = { runtime: "nodejs" };

function isDate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

const keyManual = (date: string) => `nhl:manual:${date}`;

function safeJsonParse(raw: any) {
  if (!raw) return null;
  try {
    const s = typeof raw === "string" ? raw : raw?.toString?.();
    if (!s) return null;
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const date = String((req.query as any)?.date || "").trim();
    if (!date || !isDate(date)) return res.status(400).json({ message: "Invalid date" });

    if (req.method === "GET") {
      const raw = await redis.get(keyManual(date));
      return res.status(200).json({ date, store: safeJsonParse(raw) });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
      const store = body?.store;

      if (!store || typeof store !== "object") {
        return res.status(400).json({ message: "Invalid store" });
      }

      await redis.set(keyManual(date), JSON.stringify(store));
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      await redis.del(keyManual(date));
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ message: "Method not allowed" });
  } catch (e: any) {
    return res.status(500).json({ message: "Server error", details: String(e?.message || e) });
  }
}
