import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { handle } from "@/lib/errors";
import { openDispute } from "@/lib/escrow";
import { enforceRateLimit } from "@/lib/rate-limit";
import { emitTradeUpdated } from "@/lib/socket-emit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const userId = await requireUserId();
    await enforceRateLimit(`dispute:${userId}`, 10, 60);
    const trade = await openDispute(id, userId);
    emitTradeUpdated(trade.id, trade.status, [trade.buyerId, trade.sellerId]);
    return NextResponse.json({ status: trade.status });
  });
}
