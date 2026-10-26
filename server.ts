import { createServer } from "node:http";
import { parse as parseCookie } from "cookie";
import next from "next";
import { decode } from "next-auth/jwt";
import { Server, type Socket } from "socket.io";
import { getTradeIfParty, MAX_MESSAGE_LENGTH, saveMessage } from "./lib/chat";
import { DomainError } from "./lib/errors";
import { enforceRateLimit } from "./lib/rate-limit";
import { MARKET_ROOM, registerIo, userRoom } from "./lib/socket-emit";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev });
const handler = app.getRequestHandler();

const SESSION_COOKIES = ["__Secure-next-auth.session-token", "next-auth.session-token"];

type AuthedSocket = Socket & { data: { userId: string } };
type Ack = (res: { ok: boolean; error?: string }) => void;

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handler(req, res));

  const io = new Server(httpServer, {
    cors: { origin: process.env.NEXTAUTH_URL ?? `http://localhost:${port}`, credentials: true },
    maxHttpBufferSize: 16 * 1024,
  });
  registerIo(io);

  // Autenticación del handshake con el mismo JWT de NextAuth (cookie httpOnly).
  io.use(async (socket, nextFn) => {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie ?? "");
      const raw = SESSION_COOKIES.map((n) => cookies[n]).find(Boolean);
      const token = raw ? await decode({ token: raw, secret: process.env.NEXTAUTH_SECRET ?? "" }) : null;
      if (!token?.uid) return nextFn(new Error("unauthorized"));
      socket.data.userId = token.uid;
      nextFn();
    } catch {
      nextFn(new Error("unauthorized"));
    }
  });

  io.on("connection", (s) => {
    const socket = s as AuthedSocket;
    const { userId } = socket.data;
    socket.join(userRoom(userId));
    socket.join(MARKET_ROOM);

    socket.on("join-trade", async (tradeId: unknown, ack?: Ack) => {
      if (typeof tradeId !== "string") return ack?.({ ok: false, error: "tradeId inválido" });
      const trade = await getTradeIfParty(tradeId, userId);
      if (!trade) return ack?.({ ok: false, error: "No autorizado" });
      await socket.join(tradeId);
      ack?.({ ok: true });
    });

    socket.on("new-message", async (payload: unknown, ack?: Ack) => {
      try {
        const { tradeId, content } = (payload ?? {}) as { tradeId?: unknown; content?: unknown };
        if (typeof tradeId !== "string" || typeof content !== "string") throw new DomainError(400, "Payload inválido");
        const text = content.trim();
        if (!text || text.length > MAX_MESSAGE_LENGTH) throw new DomainError(400, "Mensaje vacío o demasiado largo");
        // Re-chequeo de membresía en cada mensaje: no confiamos en que haya hecho join-trade.
        if (!socket.rooms.has(tradeId) || !(await getTradeIfParty(tradeId, userId))) {
          throw new DomainError(403, "No autorizado");
        }
        await enforceRateLimit(`chat:${userId}`, 30, 60);

        const message = await saveMessage(tradeId, userId, text);
        io.to(tradeId).emit("new-message", { tradeId, ...message });
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err instanceof DomainError ? err.message : "Error interno" });
        if (!(err instanceof DomainError)) console.error("[socket] new-message", err);
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Juan Mecánico P2P listo en http://localhost:${port} (${dev ? "dev" : "prod"})`);
  });
});
