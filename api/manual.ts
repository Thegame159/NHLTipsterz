import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedis } from "./_redis";
import { normalizeSuggestionsDeep } from "../services/normalizeSuggestionLabel";

export const config = { runtime: "nodejs" };

function isDate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

const keyManual = (date: string) => `nhl:manual:${date}`;

// ---------- JSON ----------
function safeJsonParse(raw: any) {
  if (!raw) return null;
  try {
    const s = typeof raw === "string" ? raw : raw.toString?.();
    if (!s) return null;
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ---------- Fetch helpers ----------
async function fetchWithTimeout(url: string, init: RequestInit | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(init || {}), signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---------- NHL schedule ----------
type ScheduleGame = {
  id: number;
  homeTeam?: { abbrev?: string };
  awayTeam?: { abbrev?: string };
};

async function fetchNhlScheduleGames(date: string): Promise<ScheduleGame[]> {
  const url = `https://api-web.nhle.com/v1/schedule/${date}`;
  const res = await fetchWithTimeout(url, undefined, 8000);
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);

  const games: ScheduleGame[] = [];
  if (!data?.gameWeek?.length) return games;

  for (const day of data.gameWeek) {
    if (!Array.isArray(day?.games)) continue;
    for (const g of day.games) if (g?.id) games.push(g);
  }
  return games;
}

function normAbbr(abbr: string) {
  return (abbr || "").toUpperCase().trim();
}

// ---------- Store normalization ----------
function normalizeStore(store: any) {
  try {
    return normalizeSuggestionsDeep(store);
  } catch {
    return store;
  }
}

// ---------- Validation ----------
type Suggestions = {
  tripleWin: string[];
  tripleOver15P1: string[];
  doubleOver15P1: string[];
  drawSuggestions: { game: string; explanation: string }[];
  quadrupleOver45: string[];
  over55Suggestions: string[];
};

function defaultSuggestions(): Suggestions {
  return {
    tripleWin: [],
    tripleOver15P1: [],
    doubleOver15P1: [],
    drawSuggestions: [],
    quadrupleOver45: [],
    over55Suggestions: [],
  };
}

function sanitizeSuggestions(input: any): Suggestions {
  const s = input && typeof input === "object" ? input : {};
  return {
    tripleWin: Array.isArray(s.tripleWin) ? s.tripleWin.map(String) : [],
    tripleOver15P1: Array.isArray(s.tripleOver15P1) ? s.tripleOver15P1.map(String) : [],
    doubleOver15P1: Array.isArray(s.doubleOver15P1) ? s.doubleOver15P1.map(String) : [],
    drawSuggestions: Array.isArray(s.drawSuggestions)
      ? s.drawSuggestions.map((d: any) => ({
          game: String(d?.game ?? ""),
          explanation: String(d?.explanation ?? ""),
        }))
      : [],
    quadrupleOver45: Array.isArray(s.quadrupleOver45) ? s.quadrupleOver45.map(String) : [],
    over55Suggestions: Array.isArray(s.over55Suggestions) ? s.over55Suggestions.map(String) : [],
  };
}

function uniq(arr: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const v = String(x || "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function parseGameLabel(raw: string): { a: string; b: string } | null {
  const s = String(raw || "").toUpperCase().trim();

  // aceita "AAA vs BBB" ou "AAA @ BBB"
  const m = s.match(/^([A-Z]{2,3})\s*(VS|@)\s*([A-Z]{2,3})$/i);
  if (!m) return null;

  const a = normAbbr(m[1]);
  const b = normAbbr(m[3]);
  if (!a || !b || a.length < 2 || b.length < 2) return null;
  if (a === b) return null;
  return { a, b };
}

function gameKeyFromTeams(a: string, b: string) {
  // chave não-direcional (evita problemas de ordem "A vs B" / "B vs A")
  const x = normAbbr(a);
  const y = normAbbr(b);
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

function validateMineSuggestions(sug: Suggestions, scheduleGames: ScheduleGame[]) {
  const errors: string[] = [];

  // Construir sets de equipas e jogos do dia
  const teamsOnDate = new Set<string>();
  const gamesOnDate = new Set<string>();

  for (const g of scheduleGames) {
    const h = normAbbr(g.homeTeam?.abbrev || "");
    const a = normAbbr(g.awayTeam?.abbrev || "");
    if (h) teamsOnDate.add(h);
    if (a) teamsOnDate.add(a);
    if (h && a) gamesOnDate.add(gameKeyFromTeams(h, a));
  }

  // Helpers
  const assertMax = (label: string, arr: any[], max: number) => {
    if (arr.length > max) errors.push(`${label}: máximo ${max}.`);
  };

  const assertAllTeamsAreValid = (label: string, teams: string[]) => {
    for (const t of teams) {
      const abbr = normAbbr(t);
      if (!/^[A-Z]{2,3}$/.test(abbr)) {
        errors.push(`${label}: valor inválido "${t}". Usa abreviação (ex: EDM).`);
        continue;
      }
      if (!teamsOnDate.has(abbr)) {
        errors.push(`${label}: equipa "${abbr}" não existe nos jogos de ${scheduleGames.length ? "hoje" : "esta data"}.`);
      }
    }
  };

  const assertAllGamesAreValid = (label: string, games: string[]) => {
    for (const g of games) {
      const parsed = parseGameLabel(g);
      if (!parsed) {
        errors.push(`${label}: jogo inválido "${g}". Usa "AAA vs BBB" ou "AAA @ BBB".`);
        continue;
      }
      if (!teamsOnDate.has(parsed.a) || !teamsOnDate.has(parsed.b)) {
        errors.push(`${label}: jogo "${g}" tem equipas fora da data selecionada.`);
        continue;
      }
      const key = gameKeyFromTeams(parsed.a, parsed.b);
      if (!gamesOnDate.has(key)) {
        errors.push(`${label}: jogo "${g}" não existe no schedule da data.`);
      }
    }
  };

  // --- tripleWin ---
  const tripleWin = uniq(sug.tripleWin);
  assertMax("Triplete Vitórias", tripleWin, 3);
  assertAllTeamsAreValid("Triplete Vitórias", tripleWin);

  // --- tripleOver15P1 ---
  const tripleOver = uniq(sug.tripleOver15P1);
  assertMax("Triplete Over 1.5 P1", tripleOver, 3);
  assertAllGamesAreValid("Triplete Over 1.5 P1", tripleOver);

  // --- doubleOver15P1 ---
  const doubleOver = uniq(sug.doubleOver15P1);
  assertMax("Dupla Over 1.5 P1", doubleOver, 2);
  assertAllGamesAreValid("Dupla Over 1.5 P1", doubleOver);

  // Não repetir jogos entre tripleteOver e doubleOver
  const tripleOverKeys = new Set<string>();
  for (const g of tripleOver) {
    const p = parseGameLabel(g);
    if (!p) continue;
    tripleOverKeys.add(gameKeyFromTeams(p.a, p.b));
  }
  for (const g of doubleOver) {
    const p = parseGameLabel(g);
    if (!p) continue;
    const k = gameKeyFromTeams(p.a, p.b);
    if (tripleOverKeys.has(k)) {
      errors.push(`Dupla Over 1.5 P1: não podes repetir o jogo "${g}" que já está na Triplete Over 1.5 P1.`);
    }
  }

  // --- quadrupleOver45 ---
  const quad45 = uniq(sug.quadrupleOver45);
  assertMax("Quadriplete O4.5", quad45, 4);
  assertAllGamesAreValid("Quadriplete O4.5", quad45);

  // --- over55Suggestions ---
  const over55 = uniq(sug.over55Suggestions);
  // Sem limite definido no teu contexto — apenas valida existência
  assertAllGamesAreValid("Over 5.5", over55);

  // --- drawSuggestions ---
  const draw = Array.isArray(sug.drawSuggestions) ? sug.drawSuggestions : [];
  for (const d of draw) {
    const game = String(d?.game ?? "").trim();
    if (!game) {
      errors.push(`Empate TR: "game" obrigatório.`);
      continue;
    }
    const parsed = parseGameLabel(game);
    if (!parsed) {
      errors.push(`Empate TR: jogo inválido "${game}". Usa "AAA vs BBB" ou "AAA @ BBB".`);
      continue;
    }
    if (!teamsOnDate.has(parsed.a) || !teamsOnDate.has(parsed.b)) {
      errors.push(`Empate TR: jogo "${game}" tem equipas fora da data selecionada.`);
      continue;
    }
    const key = gameKeyFromTeams(parsed.a, parsed.b);
    if (!gamesOnDate.has(key)) {
      errors.push(`Empate TR: jogo "${game}" não existe no schedule da data.`);
    }
  }

  return { ok: errors.length === 0, errors, teamsOnDate: Array.from(teamsOnDate), gamesCount: gamesOnDate.size };
}

// ---------- Handler ----------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const redis = await getRedis();
    if (!redis) return res.status(500).json({ message: "REDIS_URL não definida." });

    const date = String(req.query.date || "").trim();
    if (!date || !isDate(date)) return res.status(400).json({ message: "Invalid date" });

    if (req.method === "GET") {
      const raw = await redis.get(keyManual(date));
      const parsed = safeJsonParse(raw);
      const normalized = parsed ? normalizeStore(parsed) : null;
      return res.status(200).json({ date, store: normalized });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
      const storeRaw = body?.store;

      if (!storeRaw || typeof storeRaw !== "object") {
        return res.status(400).json({ message: "Invalid store" });
      }

      // 1) Normaliza (remove IDs tipo "2025020917 (EDM)" etc.)
      const normalizedStore = normalizeStore(storeRaw);

      // 2) Sanitiza para garantir formato esperado (arrays)
      const suggestions = sanitizeSuggestions(normalizedStore);

      // 3) Valida contra schedule real da NHL para essa data
      const scheduleGames = await fetchNhlScheduleGames(date);
      if (!scheduleGames.length) {
        return res.status(400).json({
          message: "Sem jogos no schedule para esta data. Não é possível guardar picks.",
          date,
        });
      }

      const validation = validateMineSuggestions(suggestions, scheduleGames);
      if (!validation.ok) {
        return res.status(400).json({
          message: "Validation failed",
          date,
          errors: validation.errors,
        });
      }

      // 4) Guarda no Redis já limpo e validado
      await redis.set(keyManual(date), JSON.stringify(suggestions));

      return res.status(200).json({
        ok: true,
        date,
        store: suggestions,
        meta: { teamsOnDate: validation.teamsOnDate, gamesCount: validation.gamesCount },
      });
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
