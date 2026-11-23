// api/_redis.ts
// Upstash Redis via REST (HTTP) — serverless-safe

const REDIS_REST_URL =
  process.env.NEW_REDIS_REST_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.REDIS_REST_URL;

const REDIS_REST_TOKEN =
  process.env.NEW_REDIS_REST_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.REDIS_REST_TOKEN;

type UpstashResponse<T> = { result?: T; error?: string };

const RETRIES = 3; // tentativas por comando (falhas de rede/DNS passageiras são comuns nas funções)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Alternativa quando o fetch falha por DNS (getaddrinfo EBUSY nas funções):
 * resolve o IP com dns.resolve4 (c-ares, outro caminho) e liga por https mantendo o nome para TLS/SNI.
 */
async function viaHttps(command: any[]): Promise<{ status: number; data: any }> {
  const [https, dns] = await Promise.all([import("node:https"), import("node:dns")]);
  const url = new URL(REDIS_REST_URL as string);
  const body = JSON.stringify(command);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        timeout: 8000,
        headers: {
          Authorization: `Bearer ${REDIS_REST_TOKEN}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        lookup: (host: string, _opts: any, cb: any) => {
          dns.resolve4(host, (err: any, addrs: string[]) => {
            if (err || !addrs?.length) return cb(err || new Error("dns sem resultados"));
            cb(null, addrs[0], 4);
          });
        },
      } as any,
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode || 0, data: JSON.parse(buf) });
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(body);
  });
}

/** Executa o comando; faz retry em falhas de rede e erros 5xx. Lança erro se continuar a falhar. */
async function cmdStrict<T = any>(command: any[]): Promise<T | null> {
  if (!REDIS_REST_URL || !REDIS_REST_TOKEN) {
    // Sem env vars -> comporta-se como "redis desligado"
    return null;
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    if (attempt > 0) await sleep(120 * attempt * attempt + 80);
    try {
      let status: number;
      let data: UpstashResponse<T>;
      try {
        const res = await fetch(REDIS_REST_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${REDIS_REST_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(command),
        });
        status = res.status;
        data = (await res.json()) as UpstashResponse<T>;
      } catch (fetchErr) {
        // fetch falhou (DNS/rede): tenta a via alternativa
        const r = await viaHttps(command).catch((e) => {
          throw fetchErr instanceof Error ? fetchErr : e;
        });
        status = r.status;
        data = r.data;
      }

      if (status >= 500) {
        lastErr = new Error(`Upstash HTTP ${status}`);
        continue;
      }
      if (status < 200 || status >= 300) {
        console.error("Upstash HTTP error:", status, data);
        return null;
      }
      if (data?.error) {
        console.error("Upstash command error:", data.error, command[0]);
        return null;
      }

      return (data?.result ?? null) as any;
    } catch (e) {
      lastErr = e;
    }
  }
  console.error("Upstash fetch failed:", lastErr);
  throw lastErr instanceof Error ? lastErr : new Error("Upstash fetch failed");
}

/** Igual a cmdStrict, mas devolve null em vez de lançar (comportamento original). */
async function cmd<T = any>(command: any[]): Promise<T | null> {
  try {
    return await cmdStrict<T>(command);
  } catch {
    return null;
  }
}

export const redis = {
  /** Como get, mas lança erro se o Redis estiver inacessível (para distinguir "não existe" de "falhou"). */
  async getStrict(key: string): Promise<string | null> {
    const r = await cmdStrict<string>(["GET", key]);
    return typeof r === "string" ? r : null;
  },

  async get(key: string): Promise<string | null> {
    const r = await cmd<string>(["GET", key]);
    return typeof r === "string" ? r : null;
  },

  async set(key: string, value: string): Promise<"OK" | null> {
    const r = await cmd<string>(["SET", key, value]);
    return r === "OK" ? "OK" : null;
  },

  async setPx(key: string, value: string, pxMs: number): Promise<"OK" | null> {
    // SET key value PX <ms>
    const r = await cmd<string>(["SET", key, value, "PX", String(Math.max(1, Math.floor(pxMs)))]);
    return r === "OK" ? "OK" : null;
  },

  async del(key: string): Promise<number | null> {
    const r = await cmd<number>(["DEL", key]);
    return typeof r === "number" ? r : null;
  },

  async incr(key: string): Promise<number | null> {
    const r = await cmd<number>(["INCR", key]);
    return typeof r === "number" ? r : null;
  },

  async expire(key: string, seconds: number): Promise<number | null> {
    const r = await cmd<number>(["EXPIRE", key, String(Math.max(1, Math.floor(seconds)))]);
    return typeof r === "number" ? r : null;
  },

  async scan(cursor: string, match: string, count = 100): Promise<[string, string[]] | null> {
    const r = await cmd<any>(["SCAN", cursor, "MATCH", match, "COUNT", String(count)]);
    if (Array.isArray(r) && r.length >= 2 && Array.isArray(r[1])) {
      return [String(r[0]), r[1].map(String)];
    }
    return null;
  },

  /** Todas as chaves que correspondem ao padrão (percorre o SCAN até ao fim). */
  async scanAll(match: string, count = 200, maxKeys = 5000): Promise<string[]> {
    const out = new Set<string>();
    let cursor = "0";
    for (let i = 0; i < 100; i++) {
      const r = await redis.scan(cursor, match, count);
      if (!r) break;
      cursor = r[0];
      for (const k of r[1]) out.add(k);
      if (cursor === "0" || out.size >= maxKeys) break;
    }
    return [...out];
  },
};
