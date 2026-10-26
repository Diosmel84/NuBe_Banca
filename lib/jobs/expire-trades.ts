import { cancelExpiredTrade, findExpiredTradeIds } from "@/lib/escrow";
import { emitMarketUpdated, emitTradeUpdated } from "@/lib/socket-emit";

const INTERVAL_MS = Number(process.env.EXPIRE_JOB_INTERVAL_MS ?? 30_000);

/**
 * Una pasada: cancela los trades IN_ESCROW vencidos y devuelve el locked al vendedor.
 * Es idempotente y seguro con varias instancias corriendo: cancelExpiredTrade
 * solo mueve el trade si sigue en IN_ESCROW, así que cada trade se procesa una vez.
 */
export async function runExpireTradesOnce(): Promise<number> {
  let cancelled = 0;
  for (const id of await findExpiredTradeIds()) {
    try {
      const trade = await cancelExpiredTrade(id);
      if (!trade) continue;
      cancelled++;
      emitTradeUpdated(trade.id, "CANCELLED", [trade.buyerId, trade.sellerId]);
    } catch (err) {
      // Un trade inconsistente no frena al resto; queda logueado para revisión manual.
      console.error(`[expire-trades] no se pudo cancelar ${id}`, err);
    }
  }
  if (cancelled > 0) {
    emitMarketUpdated();
    console.log(`[expire-trades] ${cancelled} trade(s) cancelados por vencimiento`);
  }
  return cancelled;
}

export function startExpireTradesJob(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return; // no superponer pasadas si una tarda más que el intervalo
    running = true;
    try {
      await runExpireTradesOnce();
    } catch (err) {
      console.error("[expire-trades] falló la pasada", err);
    } finally {
      running = false;
    }
  };
  void tick(); // al arrancar, limpia lo que haya vencido mientras el server estaba apagado
  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
