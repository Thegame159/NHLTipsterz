// api/_profile.ts
// Perfil do próprio utilizador: avatar e mudança da palavra-passe (usado por api/auth.ts).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_redis.js";
import { guard } from "./_session.js";
import { hashPassword, k, verifyPassword } from "./_auth.js";
import { AVATAR_RE } from "./_modules.js";

const MAX_PW_TRIES = 5; // tentativas erradas da palavra-passe atual por hora

const bodyOf = (req: VercelRequest) => {
  if (typeof req.body !== "string") return req.body ?? {};
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
};

/** Devolve true se tratou o pedido. */
export async function profileActions(action: string, req: VercelRequest, res: VercelResponse): Promise<boolean> {
  if (action !== "profile-avatar" && action !== "change-password") return false;
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return true;
  }
  const s = await guard(req, res, "user");
  if (!s) return true;
  const b = bodyOf(req);

  if (action === "profile-avatar") {
    const avatar = b.avatar == null ? null : String(b.avatar);
    if (avatar !== null && !AVATAR_RE.test(avatar)) {
      res.status(400).json({ error: "Avatar inválido." });
      return true;
    }
    const raw = await redis.get(k("profile", s.u));
    let prev: any = {};
    try {
      prev = raw ? JSON.parse(raw) : {};
    } catch {
      prev = {};
    }
    const ok = await redis.set(k("profile", s.u), JSON.stringify({ ...prev, avatar }));
    if (!ok) {
      res.status(503).json({ error: "Não foi possível gravar. Tenta de novo." });
      return true;
    }
    res.status(200).json({ ok: true, avatar });
    return true;
  }

  // change-password
  if (s.r === "admin") {
    res.status(400).json({ error: "A palavra-passe do administrador muda-se na Vercel (variável ADMIN_PASSWORD)." });
    return true;
  }
  const current = String(b.current ?? "");
  const next = String(b.next ?? "");
  if (next.length < 8 || next.length > 128) {
    res.status(400).json({ error: "A nova palavra-passe tem de ter pelo menos 8 caracteres." });
    return true;
  }
  const rl = k("rl-pw", s.u);
  if (Number((await redis.get(rl)) ?? 0) >= MAX_PW_TRIES) {
    res.status(429).json({ error: "Demasiadas tentativas. Tenta daqui a uma hora." });
    return true;
  }
  const raw = await redis.get(k("user", s.u));
  let rec: any = null;
  try {
    rec = raw ? JSON.parse(raw) : null;
  } catch {
    rec = null;
  }
  if (!rec?.hash) {
    res.status(404).json({ error: "Conta não encontrada." });
    return true;
  }
  if (!verifyPassword(current, rec.hash)) {
    const n = await redis.incr(rl);
    if (n === 1) await redis.expire(rl, 3600);
    res.status(400).json({ error: "A palavra-passe atual está errada." });
    return true;
  }
  const ok = await redis.set(k("user", s.u), JSON.stringify({ ...rec, hash: hashPassword(next) }));
  if (!ok) {
    res.status(503).json({ error: "Não foi possível mudar a palavra-passe. Tenta de novo." });
    return true;
  }
  await redis.del(rl);
  res.status(200).json({ ok: true });
  return true;
}
