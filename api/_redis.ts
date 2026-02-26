import { createClient } from "redis";

let _redis: ReturnType<typeof createClient> | null = null;
let _connecting: Promise<ReturnType<typeof createClient> | null> | null = null;

export async function getRedis() {
  try {
    if (_redis) return _redis;
    if (_connecting) return await _connecting;

    const url = process.env.REDIS_URL;
    if (!url) return null;

    _connecting = (async () => {
      const client = createClient({
        url,
        socket: {
          // evita loops de reconnect em serverless
          reconnectStrategy: false as any,
        },
      });

      client.on("error", (err) => console.error("Redis error:", err));

      await client.connect();
      _redis = client;
      return _redis;
    })();

    return await _connecting;
  } catch (err) {
    console.error("Redis connect failed:", err);
    _connecting = null;
    _redis = null;
    return null;
  }
}
