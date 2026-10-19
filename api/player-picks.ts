// api/player-picks.ts
// Guarda os tripletes de jogadores (golos / pontos, opções 1 e 2) mostrados na aba "Jogadores"
// e confere depois, com os jogos reais, quantos acertaram.
//
//   POST   { date, goal: Pick[][], point: Pick[][] }  → guarda (só a primeira vez de cada dia)
//   GET    ?limit=60                                  → últimos dias, com resultados já conferidos
//   DELETE ?date=YYYY-MM-DD                           → apaga um dia

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { redis } from "./_redis.js";

export const config = { runtime: "nodejs" };

const NHL_API = "https://api-web.nhle.com/v1";
const KEY_PREFIX = "nhl:ppicks:";
const keyFor = (date: string) => `${KEY_PREFIX}${date}`;
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

type Pick = {
  id: number;
  name: string;
  abbr: string; // equipa do jogador
  opp: string; // adversário
  prob: number; // % prevista (golo ou ponto, conforme o triplete)
  r?: "hit" | "miss" | "dnp"; // dnp = não jogou
  g?: number;
  a?: number;
};
type Record_ = { date: string; savedAt: number; goal: Pick[][]; point: Pick[][] };

const safeParse = (raw: any) => {
  try {
    return raw ? JSON.parse(typeof raw === "string" ? raw : String(raw)) : null;
  } catch {
    return null;
  }
};

const num = (x: unknown, d = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
};

const clean = (v: unknown): Pick[][] => {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 2).map((list) =>
    (Array.isArray(list) ? list : []).slice(0, 3).map((p: any) => ({
      id: num(p?.id),
      name: String(p?.name ?? "").slice(0, 60),
      abbr: String(p?.abbr ?? "").slice(0, 4),
      opp: String(p?.opp ?? "").slice(0, 4),
      prob: Math.max(0, Math.min(100, Math.round(num(p?.prob)))),
    })).filter((p) => p.id > 0)
  ).filter((l) => l.length > 0);
};

const seasonIdFor = (date: string) => {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 9 ? y : y - 1;
  return `${start}${start + 1}`;
};

const dayDiff = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

async function fetchLog(id: number, season: string): Promise<any[] | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${NHL_API}/player/${id}/game-log/${season}/2`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.gameLog) ? data.gameLog : [];
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Confere os picks pendentes de um dia. Devolve true se algo mudou. */
async function evaluate(rec: Record_, mode: "goal" | "point", logs: Map<number, any[] | null>): Promise<boolean> {
  let changed = false;
  const today = new Date().toISOString().slice(0, 10);
  const age = dayDiff(today, rec.date);

  for (const list of rec[mode]) {
    for (const p of list) {
      if (p.r) continue;
      const log = logs.get(p.id);
      if (log === null || log === undefined) continue; // falha de rede: tenta mais tarde
      // o jogo do jogador: contra o adversário, na data do dia (ou ±1 dia, por causa do fuso)
      const row = log.find((r) => String(r?.opponentAbbrev ?? "") === p.opp && dayDiff(String(r?.gameDate ?? ""), rec.date) <= 1);
      if (row) {
        const g = num(row.goals);
        const a = num(row.assists);
        p.g = g;
        p.a = a;
        p.r = (mode === "goal" ? g > 0 : g + a > 0) ? "hit" : "miss";
        changed = true;
      } else if (age >= 3) {
        p.r = "dnp"; // passaram 3 dias e não há jogo registado: não conta
        changed = true;
      }
    }
  }
  return changed;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
      const date = String(body?.date ?? "").trim();
      if (!isDate(date)) return res.status(400).json({ message: "Invalid date" });

      const goal = clean(body?.goal);
      const point = clean(body?.point);
      if (goal.length === 0 && point.length === 0) return res.status(400).json({ message: "Sem picks" });

      // só guarda a primeira vez: os picks avaliados são os que viste nesse dia
      if (await redis.get(keyFor(date))) return res.status(200).json({ ok: true, kept: true });

      const rec: Record_ = { date, savedAt: Date.now(), goal, point };
      await redis.set(keyFor(date), JSON.stringify(rec));
      return res.status(200).json({ ok: true, saved: true });
    }

    if (req.method === "DELETE") {
      const date = String(req.query.date || "").trim();
      if (!isDate(date)) return res.status(400).json({ message: "Invalid date" });
      await redis.del(keyFor(date));
      return res.status(200).json({ ok: true, deleted: date });
    }

    if (req.method === "GET") {
      const limit = Math.min(parseInt(String(req.query.limit || "60"), 10) || 60, 120);
      const keys = await redis.scanAll(`${KEY_PREFIX}*`);
      const dates = [...new Set(keys.map((k) => k.slice(KEY_PREFIX.length)).filter(isDate))]
        .sort((a, b) => (a < b ? 1 : -1))
        .slice(0, limit);

      const items: Record_[] = [];
      for (const d of dates) {
        const rec = safeParse(await redis.get(keyFor(d))) as Record_ | null;
        if (rec) items.push(rec);
      }

      // confere os pendentes (só dos últimos 10 dias, no máximo 60 jogadores por pedido)
      const today = new Date().toISOString().slice(0, 10);
      const pendingIds = new Set<number>();
      for (const rec of items) {
        if (rec.date > today || dayDiff(today, rec.date) > 10) continue;
        for (const m of ["goal", "point"] as const) for (const l of rec[m]) for (const p of l) if (!p.r) pendingIds.add(p.id);
      }
      const ids = [...pendingIds].slice(0, 60);
      const logsBySeason = new Map<string, Map<number, any[] | null>>();
      const needSeasons = new Set(items.map((r) => seasonIdFor(r.date)));
      for (const season of needSeasons) {
        const m = new Map<number, any[] | null>();
        for (let i = 0; i < ids.length; i += 20) {
          const batch = ids.slice(i, i + 20);
          const out = await Promise.all(batch.map((id) => fetchLog(id, season)));
          batch.forEach((id, j) => m.set(id, out[j]));
        }
        logsBySeason.set(season, m);
      }
      for (const rec of items) {
        const logs = logsBySeason.get(seasonIdFor(rec.date));
        if (!logs) continue;
        const c1 = await evaluate(rec, "goal", logs);
        const c2 = await evaluate(rec, "point", logs);
        if (c1 || c2) await redis.set(keyFor(rec.date), JSON.stringify(rec));
      }

      return res.status(200).json({ ok: true, items });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ message: "Method not allowed" });
  } catch (e: any) {
    return res.status(500).json({ message: "player-picks error", details: String(e?.message || e) });
  }
}
