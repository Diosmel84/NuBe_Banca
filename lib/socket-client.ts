"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/** Un único socket por pestaña; la cookie de sesión viaja en el handshake (mismo origen). */
export function getSocket(): Socket {
  socket ??= io({ withCredentials: true, transports: ["websocket", "polling"] });
  return socket;
}
