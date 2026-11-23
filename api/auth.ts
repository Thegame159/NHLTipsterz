// api/auth.ts
// GET  /api/auth?action=me      -> { user: { username, role } | null }
// POST /api/auth?action=login   -> { username, password }
// POST /api/auth?action=logout

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_redis.js";
import { checkCredentials, clearCookie, createSession, getSession, k, normUser, readCookie, COOKIE, sessionCookie } from "./_auth.js";

export const config = { runtime: "nodejs" };

const MAX_ATTEMPTS = 10; // tentativas falhadas por IP em 15 minutos
const WINDOW_S = 15 * 60;

const clientIp = (req: VercelRequest) =>
  String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || "unknown";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  const action = String(req.query.action ?? "");

  if (action === "me" && req.method === "GET") {
    try {
      const s = await getSession(req);
      return res.status(200).json({ user: s ? { username: s.u, role: s.r } : null });
    } catch {
      return res.status(503).json({ error: "Serviço temporariamente indisponível." });
    }
  }

  if (action === "logout" && req.method === "POST") {
    const token = readCookie(req, COOKIE);
    if (token && /^[0-9a-f]{64}$/.test(token)) await redis.del(k("session", token));
    res.setHeader("Set-Cookie", clearCookie());
    return res.status(200).json({ ok: true });
  }

  if (action === "login" && req.method === "POST") {
    if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
      return res.status(500).json({ error: "Login não configurado (ADMIN_USER / ADMIN_PASSWORD em falta)." });
    }
    const rlKey = k("rl", clientIp(req));
    const tries = Number((await redis.get(rlKey)) ?? 0);
    if (tries >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: "Demasiadas tentativas. Tenta daqui a 15 minutos." });
    }

    const body = typeof req.body === "string" ? safeParse(req.body) : req.body;
    const username = normUser(body?.username);
    const password = String(body?.password ?? "");
    const session = username && password ? await checkCredentials(username, password) : null;

    if (!session) {
      const n = await redis.incr(rlKey);
      if (n === 1) await redis.expire(rlKey, WINDOW_S);
      return res.status(401).json({ error: "Utilizador ou palavra-passe errados." });
    }

    await redis.del(rlKey);
    let token: string;
    try {
      token = await createSession(session);
    } catch {
      return res.status(503).json({ error: "Serviço temporariamente indisponível. Tenta de novo." });
    }
    res.setHeader("Set-Cookie", sessionCookie(token));
    return res.status(200).json({ user: { username: session.u, role: session.r } });
  }

  return res.status(405).json({ error: "Método não permitido." });
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
