import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { DomainError, handle } from "@/lib/errors";
import { getTradeView } from "@/lib/trade-view";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const userId = await requireUserId();
    const view = await getTradeView(params.id, userId);
    // 404 también para no-partes: no revelamos que el trade existe.
    if (!view) throw new DomainError(404, "Trade no encontrado");
    return NextResponse.json(view);
  });
}
