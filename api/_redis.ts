// api/_redis.ts

const REDIS_REST_URL = process.env.REDIS_REST_URL;
const REDIS_REST_TOKEN = process.env.REDIS_REST_TOKEN;

if (!REDIS_REST_URL || !REDIS_REST_TOKEN) {
  console.warn("⚠️ Upstash REST Redis not configured");
}

async function redisFetch(command: any[]) {
  if (!REDIS_REST_URL || !REDIS_REST_TOKEN) return null;

  const response = await fetch(REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  const data = await response.json();
  return data?.result ?? null;
}

export const redis = {
  async get(key: string) {
    return redisFetch(["GET", key]);
  },

  async set(key: string, value: string) {
    return redisFetch(["SET", key, value]);
  },

  async del(key: string) {
    return redisFetch(["DEL", key]);
  },

  async scan(cursor: string, match: string, count = 100) {
    return redisFetch(["SCAN", cursor, "MATCH", match, "COUNT", String(count)]);
  },
};
