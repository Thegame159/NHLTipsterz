import { createClient } from "redis";

let _redis: ReturnType<typeof createClient> | null = null;
let _connecting = false;

export async function getRedis() {
  try {
    if (_redis) return _redis;
    if (_connecting) return null;

    const url = process.env.REDIS_URL;
    if (!url) {
      console.error("REDIS_URL not defined");
      return null;
    }

    _connecting = true;

    const client = createClient({
      url,
      socket: {
        reconnectStrategy: false, // evita loops
      },
    });

    client.on("error", (err) => {
      console.error("Redis error:", err);
    });

    await client.connect();

    _redis = client;
    _connecting = false;

    return _redis;
  } catch (err) {
    console.error("Redis connection failed:", err);
    _connecting = false;
    return null; // ⬅️ CRUCIAL: nunca deixar crashar
  }
}
