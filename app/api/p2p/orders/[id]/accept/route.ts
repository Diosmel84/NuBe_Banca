import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { handle } from "@/lib/errors";
import { acceptOrder } from "@/lib/escrow";
import { moneySchema } from "@/lib/money";
import { enforceRateLimit } from "@/lib/rate-limit";
import { emitMarketUpdated, emitTradeUpdated } from "@/lib/socket-emit";

// amount opcional: si no viene, se toma todo lo disponible de la orden.
const schema = z.object({ amount: moneySchema.optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const userId = await requireUserId();
    await enforceRateLimit(`accept:${userId}`, 10, 60);
    const body = schema.parse(await req.json().catch(() => ({})));

    const trade = await acceptOrder(params.id, userId, body.amount);
    emitTradeUpdated(trade.id, trade.status, [trade.buyerId, trade.sellerId]);
    emitMarketUpdated();
    return NextResponse.json({ tradeId: trade.id, status: trade.status, escrowTxHash: trade.escrowTxHash }, { status: 201 });
  });
}
