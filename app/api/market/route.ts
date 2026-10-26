import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const typeParam = new URL(req.url).searchParams.get("type");
    const type = typeParam === "BUY" || typeParam === "SELL" ? typeParam : undefined;

    const orders = await prisma.p2POrder.findMany({
      where: { status: "OPEN", amount: { gt: 0 }, ...(type ? { type } : {}) },
      // Venta: más barato primero. Compra: mejor oferta primero.
      orderBy: [{ pricePerUsdt: type === "BUY" ? "desc" : "asc" }, { createdAt: "asc" }],
      take: 100,
      include: {
        user: {
          select: { id: true, alias: true, reputation: true, completedTrades: true, avgReleaseMinutes: true, isJuanVerified: true, dniVerified: true },
        },
      },
    });

    return NextResponse.json(
      orders.map((o) => ({
        id: o.id,
        type: o.type,
        amount: o.amount.toFixed(2),
        pricePerUsdt: o.pricePerUsdt.toFixed(2),
        paymentMethod: o.paymentMethod,
        minLimit: o.minLimit?.toFixed(2) ?? null,
        maxLimit: o.maxLimit?.toFixed(2) ?? null,
        createdAt: o.createdAt.toISOString(),
        user: o.user,
      })),
    );
  });
}
