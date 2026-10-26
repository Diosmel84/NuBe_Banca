import type { ChatMessage } from "@prisma/client";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

export const MAX_MESSAGE_LENGTH = 1000;

export interface ChatMessageDTO {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

const ctx = (tradeId: string) => `chat:${tradeId}`;

export function toDTO(m: ChatMessage): ChatMessageDTO {
  let content: string;
  try {
    content = decrypt({ ciphertext: m.encryptedContent, iv: m.iv }, ctx(m.tradeId));
  } catch {
    content = "[mensaje ilegible]";
  }
  return { id: m.id, senderId: m.senderId, content, createdAt: m.createdAt.toISOString() };
}

export async function saveMessage(tradeId: string, senderId: string, content: string): Promise<ChatMessageDTO> {
  const { ciphertext, iv } = encrypt(content, ctx(tradeId));
  const m = await prisma.chatMessage.create({ data: { tradeId, senderId, encryptedContent: ciphertext, iv } });
  return { id: m.id, senderId, content, createdAt: m.createdAt.toISOString() };
}

export async function listMessages(tradeId: string): Promise<ChatMessageDTO[]> {
  const rows = await prisma.chatMessage.findMany({ where: { tradeId }, orderBy: { createdAt: "asc" }, take: 500 });
  return rows.map(toDTO);
}

/** ¿Es parte del trade? Única regla de acceso a chat, comprobante y vista del trade. */
export async function getTradeIfParty(tradeId: string, userId: string) {
  const trade = await prisma.p2PTrade.findUnique({ where: { id: tradeId } });
  if (!trade || (trade.buyerId !== userId && trade.sellerId !== userId)) return null;
  return trade;
}
