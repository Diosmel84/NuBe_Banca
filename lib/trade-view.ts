import { listMessages, type ChatMessageDTO } from "@/lib/chat";
import { PAYMENT_WINDOW_MINUTES } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export interface TradeView {
  id: string;
  status: "IN_ESCROW" | "PAID" | "RELEASED" | "DISPUTED" | "CANCELLED";
  role: "buyer" | "seller";
  amount: string;
  totalArs: string;
  pricePerUsdt: string;
  commission: string;
  paymentMethod: string;
  escrowTxHash: string | null;
  hasProof: boolean;
  createdAt: string;
  paymentDeadline: string;
  me: { id: string; requires2FA: boolean };
  counterpart: { alias: string; reputation: number; completedTrades: number; isJuanVerified: boolean };
  seller: { alias: string };
  buyer: { alias: string };
  messages: ChatMessageDTO[];
}

/** Devuelve la vista serializable del trade, o null si el usuario no es parte. */
export async function getTradeView(tradeId: string, userId: string): Promise<TradeView | null> {
  const trade = await prisma.p2PTrade.findUnique({
    where: { id: tradeId },
    include: { order: true, buyer: true, seller: true },
  });
  if (!trade || (trade.buyerId !== userId && trade.sellerId !== userId)) return null;

  const role = trade.buyerId === userId ? "buyer" : "seller";
  const me = role === "buyer" ? trade.buyer : trade.seller;
  const other = role === "buyer" ? trade.seller : trade.buyer;

  return {
    id: trade.id,
    status: trade.status,
    role,
    amount: trade.amount.toFixed(2),
    totalArs: trade.totalArs.toFixed(2),
    pricePerUsdt: trade.order.pricePerUsdt.toFixed(2),
    commission: trade.commission.toFixed(2),
    paymentMethod: trade.order.paymentMethod,
    escrowTxHash: trade.escrowTxHash,
    hasProof: Boolean(trade.paymentProofUrl),
    createdAt: trade.createdAt.toISOString(),
    paymentDeadline: new Date(trade.createdAt.getTime() + PAYMENT_WINDOW_MINUTES * 60_000).toISOString(),
    me: { id: me.id, requires2FA: Boolean(me.twoFASecret) },
    counterpart: {
      alias: other.alias,
      reputation: other.reputation,
      completedTrades: other.completedTrades,
      isJuanVerified: other.isJuanVerified,
    },
    seller: { alias: trade.seller.alias },
    buyer: { alias: trade.buyer.alias },
    messages: await listMessages(trade.id),
  };
}
