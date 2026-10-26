import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getTradeIfParty } from "@/lib/chat";
import { DomainError, handle } from "@/lib/errors";
import { markPaid } from "@/lib/escrow";
import { enforceRateLimit } from "@/lib/rate-limit";
import { emitTradeUpdated } from "@/lib/socket-emit";

const MAX_BYTES = 5 * 1024 * 1024;

// Validamos por magic bytes, no por el Content-Type que manda el cliente.
function sniffExtension(buf: Buffer): "png" | "jpg" | "pdf" | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  return null;
}

const storageDir = () =>path.resolve(process.env.STORAGE_DIR ?? "./storage", "proofs");

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const userId = await requireUserId();
    await enforceRateLimit(`mark-paid:${userId}`, 10, 60);

    const trade = await getTradeIfParty(params.id, userId);
    if (!trade) throw new DomainError(404, "Trade no encontrado");
    if (trade.buyerId !== userId) throw new DomainError(403, "Solo el comprador puede marcar como pagado");
    if (trade.status !== "IN_ESCROW") throw new DomainError(409, "El trade no está esperando pago");

    const form = await req.formData();
    const file = form.get("proof");
    if (!(file instanceof File)) throw new DomainError(400, "Falta el comprobante (campo 'proof')");
    if (file.size === 0 || file.size > MAX_BYTES) throw new DomainError(400, "El comprobante debe pesar entre 1 byte y 5 MB");

    const buf = Buffer.from(await file.arrayBuffer());
    const ext = sniffExtension(buf);
    if (!ext) throw new DomainError(400, "Formato no permitido (PNG, JPG o PDF)");

    // Nombre generado por el server: nada del cliente toca el path.
    const fileName = `${randomUUID()}.${ext}`;
    const dir = path.join(storageDir(), trade.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, fileName), buf, { flag: "wx" });

    const updated = await markPaid(trade.id, userId, `/api/p2p/trades/${trade.id}/proof?f=${fileName}`);
    emitTradeUpdated(updated.id, updated.status, [updated.buyerId, updated.sellerId]);
    return NextResponse.json({ status: updated.status });
  });
}
