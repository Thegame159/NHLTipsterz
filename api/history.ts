import type { NextApiRequest, NextApiResponse } from "next";

// tenta usar o teu redis helper se existir
let redisGet: ((key: string) => Promise<any>) | null = null;
let redisSet: ((key: string, value: any) => Promise<any>) | null = null;
let redisKeys: ((pattern: string) => Promise<string[]>) | null = null;

try {
  // ajusta o import se o teu redis.ts exportar de outra forma
  // exemplos comuns:
  // export const redis = new Redis(...)
  // export default redis
  // export async function getJson/setJson...
  // ----
  // Aqui assumo que tens um export chamado "redis" com get/set/keys.
  // Se der erro, cai para memória.
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("./_redis");
  const r = mod?.redis || mod?.default || mod;
  if (r?.get && r?.set) {
    redisGet = (k) => r.get(k);
    redisSet = (k, v) => r.set(k, v);
    redisKeys = (p) => (r.keys ? r.keys(p) : Promise.resolve([]));
  }
} catch {
  // sem redis: cai para memória
}

type Suggestions = any;

type StoreItem = {
  date: string;
  auto: null | { savedAt: number; suggestions: Suggestions };
  mine: null | { savedAt: number; suggestions: Suggestions };
};

const KEY_PREFIX = "history:";

// fallback em memória (dev)
let memoryStore: Record<string, StoreItem> = {};

function toInt(x: any, def: number) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

async function loadItem(date: string): Promise<StoreItem | null> {
  const key = `${KEY_PREFIX}${date}`;

  if (redisGet) {
    const raw = await redisGet(key);
    if (!raw) return null;

    // dependendo do redis client, pode vir string
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return raw as StoreItem;
  }

  return memoryStore[date] ?? null;
}

async function saveItem(item: StoreItem): Promise<void> {
  const key = `${KEY_PREFIX}${item.date}`;

  if (redisSet) {
    // guarda como string para ficar consistente
    await redisSet(key, JSON.stringify(item));
    return;
  }

  memoryStore[item.date] = item;
}

async function listDates(): Promise<string[]> {
  if (redisKeys) {
    const keys = await redisKeys(`${KEY_PREFIX}*`);
    return (keys || [])
      .map((k) => String(k))
      .filter((k) => k.startsWith(KEY_PREFIX))
      .map((k) => k.slice(KEY_PREFIX.length));
  }
  return Object.keys(memoryStore);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const limit = toInt(req.query.limit, 100);

      const dates = await listDates();
      dates.sort((a, b) => (a < b ? 1 : -1));

      const out: StoreItem[] = [];
      for (const d of dates.slice(0, limit)) {
        const item = await loadItem(d);
        if (item) out.push(item);
      }

      return res.status(200).json({ items: out });
    }

    if (req.method === "POST") {
      // garantir que o body vem parsed (Next normalmente faz isto se vier JSON)
      const body = req.body || {};
      const date = String(body.date || "").trim();
      const auto = body.auto ?? null;
      const mine = body.mine ?? null;

      // compat: se vier {date, picks} do frontend antigo, interpreta como mine
      const picks = body.picks ?? null;

      if (!date) return res.status(400).json({ error: "Missing date" });

      let existing = (await loadItem(date)) ?? { date, auto: null, mine: null };

      // MERGE
      if (auto) existing.auto = auto;
      if (mine) existing.mine = mine;

      // fallback: payload antigo {picks}
      if (picks && !mine) {
        existing.mine = { savedAt: Date.now(), suggestions: picks };
      }

      await saveItem(existing);

      return res.status(200).json({ ok: true, item: existing });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}
