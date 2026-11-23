// api/_auth.ts
// Utilitários de autenticação (sessões no Redis, palavras-passe com scrypt).
// As chaves levam o ambiente (prod / dev) no nome: o site de teste partilha o Redis mas não as contas/sessões.

import crypto from "node:crypto";
import type { VercelRequest } from "@vercel/node";
import { redis } from "./_redis.js";

import { COOKIE, k, sessionFromCookieHeader } from "./_session.js";
import type { Session } from "./_session.js";

export { COOKIE, k };
export type { Role, Session } from "./_session.js";
export const SESSION_DAYS = 30;

const safeEq = (a: string, b: string) => {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export const normUser = (u: unknown) => String(u ?? "").trim().toLowerCase();

/** Confere utilizador/palavra-passe. O administrador vem das variáveis ADMIN_USER / ADMIN_PASSWORD. */
export async function checkCredentials(username: string, password: string): Promise<Session | null> {
  const adminUser = normUser(process.env.ADMIN_USER);
  const adminPass = process.env.ADMIN_PASSWORD ?? "";
  if (adminUser && adminPass && username === adminUser) {
    return safeEq(password, adminPass) ? { u: adminUser, r: "admin" } : null;
  }
  const raw = await redis.get(k("user", username));
  if (!raw) {
    // custo de scrypt mesmo quando o utilizador não existe (não revela quais existem)
    verifyPassword(password, "00:00");
    return null;
  }
  try {
    const rec = JSON.parse(raw) as { hash: string; disabled?: boolean };
    if (rec.disabled) return null;
    return verifyPassword(password, rec.hash) ? { u: username, r: "user" } : null;
  } catch {
    return null;
  }
}

export async function createSession(s: Session): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const ok = await redis.setPx(k("session", token), JSON.stringify(s), SESSION_DAYS * 24 * 3600 * 1000);
  if (!ok) throw new Error("Não foi possível guardar a sessão.");
  return token;
}

export function readCookie(req: VercelRequest, name: string): string | null {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export const getSession = (req: VercelRequest): Promise<Session | null> => sessionFromCookieHeader(req.headers.cookie);

export const sessionCookie = (token: string) =>
  `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 24 * 3600}`;
export const clearCookie = () => `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
