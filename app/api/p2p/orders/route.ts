import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { handle } from "@/lib/errors";
import { createOrder } from "@/lib/escrow";
import { moneySchema } from "@/lib/money";
import { enforceRateLimit } from "@/lib/rate-limit";
import { emitMarketUpdated } from "@/lib/socket-emit";

const schema = z.object({
  type: z.enum(["BUY", "SELL"]),
  amount: moneySchema,
  pricePerUsdt: moneySchema,
  paymentMethod: z.string().trim().min(2).max(120),
  minLimit: moneySchema.optional(),
  maxLimit: moneySchema.optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const userId = await requireUserId();
    await enforceRateLimit(`orders:create:${userId}`, 20, 60);
    const data = schema.parse(await req.json());
    const order = await createOrder({ userId, ...data });
    emitMarketUpdated();
    return NextResponse.json({ id: order.id, status: order.status }, { status: 201 });
  });
}
