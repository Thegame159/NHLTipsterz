// api/_redis.ts
// Upstash Redis via REST (HTTP) — serverless-safe

const REDIS_REST_URL = process.env.REDIS_REST_URL;
const REDIS_REST_TOKEN = process.env.REDIS_REST_TOKEN;

type UpstashResponse<T> = { result?: T; error?: string };

async function cmd<T = any>(command: any[]): Promise<T | null> {
  if (!REDIS_REST_URL || !REDIS_REST_TOKEN) {
    // Sem env vars -> comporta-se como "redis desligado"
    return null;
  }

  try {
    const res = await fetch(REDIS_REST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });

    const data = (await res.json()) as UpstashResponse<T>;

    if (!res.ok) {
      console.error("Upstash HTTP error:", res.status, data);
      return null;
    }
    if (data?.error) {
      console.error("Upstash command error:", data.error, command);
      return null;
    }

    return (data?.result ?? null) as any;
  } catch (e) {
    console.error("Upstash fetch failed:", e);
    return null;
  }
}

export const redis = {
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
    if (Array.isArray(r) && typeof r[0] === "string" && Array.isArray(r[1])) return [r[0], r[1].map(String)];
    return null;
  },
};
