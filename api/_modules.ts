// api/_modules.ts
// Módulos (separadores) que cada utilizador pode ver. O administrador vê sempre todos.
// Guardado no registo do utilizador: auth:{ns}:user:{nome} -> { ..., modules?: string[] }

import { redis } from "./_redis.js";
import { k } from "./_session.js";

export const MODULES = ["schedule", "suggestions", "players", "mypicks", "stats", "calibration"] as const;
export type Module = (typeof MODULES)[number];

/** Módulos de quem ainda não tem nenhum atribuído (utilizadores novos). */
export const DEFAULT_MODULES: Module[] = ["schedule", "suggestions"];

export const cleanModules = (v: unknown): Module[] =>
  Array.isArray(v) ? MODULES.filter((m) => v.includes(m)) : [...DEFAULT_MODULES];

/** Utilizador como o cliente o vê: nome, perfil e módulos. */
export async function publicUser(s: { u: string; r: "admin" | "user" }) {
  if (s.r === "admin") return { username: s.u, role: s.r, modules: [...MODULES] };
  let modules: Module[] = [...DEFAULT_MODULES];
  try {
    const raw = await redis.get(k("user", s.u));
    if (raw) {
      const rec = JSON.parse(raw);
      if (rec.disabled || accessExpired(rec.accessUntil)) return null; // conta desativada ou acesso expirado
      modules = cleanModules(rec.modules);
    }
  } catch {
    /* fica com os módulos por omissão */
  }
  return { username: s.u, role: s.r, modules };
}

/** Data de hoje em Lisboa (AAAA-MM-DD). */
export const todayLisbon = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** O acesso termina no fim do dia indicado ("válido até"). Sem data = sem limite. */
export const accessExpired = (until?: string | null) => !!until && DATE_RE.test(until) && until < todayLisbon();
