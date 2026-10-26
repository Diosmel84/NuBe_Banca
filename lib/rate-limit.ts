import { redis } from "@/lib/redis";
import { DomainError } from "@/lib/errors";

/**
 * Fixed window en Redis. Falla CERRADO: si Redis no responde, no dejamos
 * pasar operaciones sensibles (accept/release) sin límite.
 */
export async function enforceRateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const redisKey = `rl:${key}:${bucket}`;
  let count: number;
  try {
    const res = await redis.multi().incr(redisKey).expire(redisKey, windowSec).exec();
    count = Number(res?.[0]?.[1] ?? 0);
  } catch (err) {
    console.error("[rate-limit] redis no disponible", err);
    throw new DomainError(503, "Servicio temporalmente no disponible");
  }
  if (count > limit) {
    throw new DomainError(429, "Demasiadas solicitudes. Esperá un minuto.");
  }
}
