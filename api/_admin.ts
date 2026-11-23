// api/_admin.ts
// Convites, registo por convite e gestão de utilizadores (usado por api/auth.ts).
// Chaves: auth:{ns}:invite:{token} -> { createdAt, expiresAt, note? }   auth:{ns}:user:{nome} -> { hash, createdAt, disabled?, invite? }

import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_redis.js";
import { guard } from "./_session.js";
import { createSession, hashPassword, k, normUser, sessionCookie } from "./_auth.js";

const INVITE_DAYS = 7;
const TOKEN_RE = /^[0-9a-f]{32}$/;
const USER_RE = /^[a-z0-9._-]{3,24}$/;
const MAX_REG_PER_HOUR = 10;

const clientIp = (req: VercelRequest) => String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || "unknown";
const bodyOf = (req: VercelRequest) => {
  if (typeof req.body !== "string") return req.body ?? {};
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
};
const parse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

type Invite = { createdAt: number; expiresAt: number };
const readInvite = async (token: string): Promise<Invite | null> => {
  if (!TOKEN_RE.test(token)) return null;
  const inv = parse<Invite>(await redis.get(k("invite", token)));
  if (!inv || inv.expiresAt < Date.now()) return null;
  return inv;
};

/** Devolve true se tratou o pedido. */
export async function adminActions(action: string, req: VercelRequest, res: VercelResponse): Promise<boolean> {
  // ── público: verificar um convite ──
  if (action === "invite-check" && req.method === "GET") {
    const inv = await readInvite(String(req.query.token ?? ""));
    res.status(200).json({ valid: !!inv });
    return true;
  }

  // ── público: registar com convite ──
  if (action === "register" && req.method === "POST") {
    const rl = k("rl-reg", clientIp(req));
    if (Number((await redis.get(rl)) ?? 0) >= MAX_REG_PER_HOUR) {
      res.status(429).json({ error: "Demasiadas tentativas. Tenta mais tarde." });
      return true;
    }
    const n = await redis.incr(rl);
    if (n === 1) await redis.expire(rl, 3600);

    const b = bodyOf(req);
    const token = String(b.token ?? "");
    const username = normUser(b.username);
    const password = String(b.password ?? "");

    if (!USER_RE.test(username)) {
      res.status(400).json({ error: "Utilizador inválido: 3 a 24 caracteres (letras, números, . _ -)." });
      return true;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: "A palavra-passe tem de ter pelo menos 8 caracteres." });
      return true;
    }
    const inv = await readInvite(token);
    if (!inv) {
      res.status(410).json({ error: "Este convite já não é válido (usado, cancelado ou expirado)." });
      return true;
    }
    if (username === normUser(process.env.ADMIN_USER) || (await redis.get(k("user", username)))) {
      res.status(409).json({ error: "Esse nome de utilizador já existe. Escolhe outro." });
      return true;
    }

    // consome o convite primeiro (uso único); se alguém o apanhou entretanto, DEL devolve 0
    const removed = await redis.del(k("invite", token));
    if (removed !== 1) {
      res.status(410).json({ error: "Este convite já não é válido (usado, cancelado ou expirado)." });
      return true;
    }
    const saved = await redis.set(k("user", username), JSON.stringify({ hash: hashPassword(password), createdAt: Date.now() }));
    if (!saved) {
      // devolve o convite se a gravação falhou
      await redis.set(k("invite", token), JSON.stringify(inv));
      res.status(503).json({ error: "Serviço temporariamente indisponível. Tenta de novo." });
      return true;
    }
    try {
      const sess = await createSession({ u: username, r: "user" });
      res.setHeader("Set-Cookie", sessionCookie(sess));
      res.status(200).json({ user: { username, role: "user" } });
    } catch {
      res.status(201).json({ ok: true, loginNeeded: true });
    }
    return true;
  }

  // ── só administrador ──
  const isAdminAction = ["invites", "invite-create", "invite-cancel", "users", "user-disable"].includes(action);
  if (!isAdminAction) return false;
  const s = await guard(req, res, "admin");
  if (!s) return true;

  if (action === "invite-create" && req.method === "POST") {
    const token = crypto.randomBytes(16).toString("hex");
    const now = Date.now();
    const inv: Invite = { createdAt: now, expiresAt: now + INVITE_DAYS * 24 * 3600 * 1000 };
    const ok = await redis.setPx(k("invite", token), JSON.stringify(inv), INVITE_DAYS * 24 * 3600 * 1000);
    if (!ok) {
      res.status(503).json({ error: "Não foi possível criar o convite. Tenta de novo." });
      return true;
    }
    res.status(200).json({ token, ...inv });
    return true;
  }

  if (action === "invites" && req.method === "GET") {
    const keys = await redis.scanAll(k("invite", "*"));
    const rows = await Promise.all(
      keys.map(async (key) => {
        const inv = parse<Invite>(await redis.get(key));
        return inv ? { token: key.split(":").pop() as string, ...inv } : null;
      })
    );
    res.status(200).json({ invites: rows.filter(Boolean).sort((a: any, b: any) => b.createdAt - a.createdAt) });
    return true;
  }

  if (action === "invite-cancel" && req.method === "POST") {
    const token = String(bodyOf(req).token ?? "");
    if (!TOKEN_RE.test(token)) {
      res.status(400).json({ error: "Convite inválido." });
      return true;
    }
    await redis.del(k("invite", token));
    res.status(200).json({ ok: true });
    return true;
  }

  if (action === "users" && req.method === "GET") {
    const keys = await redis.scanAll(k("user", "*"));
    const rows = await Promise.all(
      keys.map(async (key) => {
        const rec = parse<{ createdAt?: number; disabled?: boolean }>(await redis.get(key));
        return rec ? { username: key.split(":").pop() as string, createdAt: rec.createdAt ?? 0, disabled: !!rec.disabled } : null;
      })
    );
    res.status(200).json({ users: rows.filter(Boolean).sort((a: any, b: any) => a.username.localeCompare(b.username)) });
    return true;
  }

  if (action === "user-disable" && req.method === "POST") {
    const b = bodyOf(req);
    const username = normUser(b.username);
    const disabled = !!b.disabled;
    const rec = parse<any>(await redis.get(k("user", username)));
    if (!rec) {
      res.status(404).json({ error: "Utilizador não encontrado." });
      return true;
    }
    await redis.set(k("user", username), JSON.stringify({ ...rec, disabled }));
    if (disabled) {
      // termina as sessões ativas desse utilizador
      const sess = await redis.scanAll(k("session", "*"));
      await Promise.all(
        sess.map(async (key) => {
          const v = parse<{ u: string }>(await redis.get(key));
          if (v?.u === username) await redis.del(key);
        })
      );
    }
    res.status(200).json({ ok: true });
    return true;
  }

  res.status(405).json({ error: "Método não permitido." });
  return true;
}
