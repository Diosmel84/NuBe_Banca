import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { __redis?: Redis };

function create() {
  // lazyConnect: no abre conexión al importar (ej. durante `next build`), sí en el primer comando.
  const client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
  });
  client.on("error", (err) => console.error("[redis]", err.message));
  return client;
}

export const redis = globalForRedis.__redis ?? create();

globalForRedis.__redis = redis;
