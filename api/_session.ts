// api/_session.ts
// Leitura de sessões e proteção de rotas. Sem dependências de Node (funciona também no runtime "edge").

import { redis } from "./_redis.js";

export type Role = "admin" | "user";
export type Session = { u: string; r: Role };

export const COOKIE = "nhl_session";

// O ambiente (prod / dev) vai no nome das chaves: o site de teste partilha o Redis mas não as contas/sessões.
const NS = process.env.VERCEL_ENV === "production" ? "prod" : "dev";
export const k = (...parts: string[]) => `auth:${NS}:${parts.join(":")}`;

export function cookieFromHeader(header: string | null | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export async function sessionFromCookieHeader(header: string | null | undefined): Promise<Session | null> {
  const token = cookieFromHeader(header, COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const raw = await redis.getStrict(k("session", token)); // lança erro se o Redis falhar
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

const DENY = {
  503: { message: "Serviço temporariamente indisponível. Tenta de novo daqui a instantes.", code: "UNAVAILABLE" },
  401: { message: "Sessão em falta. Inicia sessão.", code: "UNAUTHENTICATED" },
  403: { message: "Sem permissão para esta ação.", code: "FORBIDDEN" },
} as const;

const allowed = (s: Session, need: Role) => need === "user" || s.r === "admin";

/** Rotas Node (VercelRequest/VercelResponse). Devolve a sessão, ou responde 401/403 e devolve null. */
export async function guard(req: any, res: any, need: Role = "user"): Promise<Session | null> {
  let s: Session | null;
  try {
    s = await sessionFromCookieHeader(req.headers?.cookie);
  } catch {
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json(DENY[503]);
    return null;
  }
  if (!s) {
    res.setHeader("Cache-Control", "no-store");
    res.status(401).json(DENY[401]);
    return null;
  }
  if (!allowed(s, need)) {
    res.status(403).json(DENY[403]);
    return null;
  }
  return s;
}

/** Rotas Edge (Request/Response). Devolve a sessão, ou uma Response 401/403. */
export async function guardEdge(req: Request, need: Role = "user"): Promise<{ session: Session } | { deny: Response }> {
  const mk = (status: 401 | 403 | 503) =>
    new Response(JSON.stringify(DENY[status]), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  let s: Session | null;
  try {
    s = await sessionFromCookieHeader(req.headers.get("cookie"));
  } catch {
    return { deny: mk(503) };
  }
  if (!s) return { deny: mk(401) };
  if (!allowed(s, need)) return { deny: mk(403) };
  return { session: s };
}
