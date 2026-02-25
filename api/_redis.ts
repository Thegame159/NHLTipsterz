import { createClient } from "redis";

let _redis: ReturnType<typeof createClient> | null = null;

export async function getRedis() {
  if (_redis) return _redis;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  const client = createClient({ url });
  client.on("error", (err) => console.error("Redis error:", err));
  await client.connect();

  _redis = client;
  return _redis;
}
