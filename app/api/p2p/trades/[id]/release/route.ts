import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { DomainError, handle } from "@/lib/errors";
import { releaseTrade } from "@/lib/escrow";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { emitTradeUpdated } from "@/lib/socket-emit";
import { verifyUserTotp } from "@/lib/totp";

const schema = z.object({ totp: z.string().optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const userId = await requireUserId();
    await enforceRateLimit(`release:${userId}`, 10, 60);
    const { totp } = schema.parse(await req.json().catch(() => ({})));

    // Liberar fondos es la operación más sensible: si el vendedor tiene 2FA, se exige código.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { twoFASecret: true } });
    if (user.twoFASecret) {
      if (!totp || !(await verifyUserTotp(userId, user.twoFASecret, totp))) {
        throw new DomainError(401, "Código 2FA inválido");
      }
    }

    // releaseTrade valida vendedor + estado PAID de forma atómica.
    const trade = await releaseTrade(params.id, userId);
    emitTradeUpdated(trade.id, "RELEASED", [trade.buyerId, trade.sellerId]);
    return NextResponse.json({ status: "RELEASED", commission: trade.commission.toFixed(2) });
  });
}
