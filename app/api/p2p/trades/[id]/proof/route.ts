import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getTradeIfParty } from "@/lib/chat";
import { DomainError, handle } from "@/lib/errors";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", pdf: "application/pdf" };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const userId = await requireUserId();
    const trade = await getTradeIfParty(id, userId);
    if (!trade?.paymentProofUrl) throw new DomainError(404, "Comprobante no encontrado");

    // El nombre sale de lo que guardó el server en DB, nunca del query del request.
    const fileName = new URL(trade.paymentProofUrl, "http://x").searchParams.get("f") ?? "";
    if (!/^[0-9a-f-]{36}\.(png|jpg|pdf)$/.test(fileName)) throw new DomainError(404, "Comprobante no encontrado");
    const ext = fileName.split(".").pop() as string;

    const base = path.resolve(process.env.STORAGE_DIR ?? "./storage", "proofs");
    const data = await readFile(path.join(base, trade.id, fileName));
    return new NextResponse(data, {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="comprobante.${ext}"`,
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      },
    });
  });
}
