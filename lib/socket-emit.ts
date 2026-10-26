import type { Server } from "socket.io";

// server.ts registra la instancia; los route handlers corren en el mismo proceso Node.
const g = globalThis as unknown as { __io?: Server };

export const registerIo = (io: Server) => {
  g.__io = io;
};

export const userRoom = (userId: string) => `user:${userId}`;
export const MARKET_ROOM = "market";

export function emitTradeUpdated(tradeId: string, status: string, partyIds: string[]) {
  const io = g.__io;
  if (!io) return;
  const payload = { tradeId, status, at: new Date().toISOString() };
  io.to(tradeId).emit("trade-updated", payload);
  // Aviso a cada parte aunque no tenga abierta la pantalla del trade (ej. el maker de la orden).
  for (const id of partyIds) io.to(userRoom(id)).emit("trade-updated", payload);
}

export function emitMarketUpdated() {
  g.__io?.to(MARKET_ROOM).emit("market-updated");
}
