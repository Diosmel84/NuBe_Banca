import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireUserId } from "@/lib/auth";
import { sealString } from "@/lib/crypto";
import { DomainError, handle } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { generateTotpSecret, totpKeyUri } from "@/lib/totp";

/** Genera un secreto pendiente (cifrado, en Redis 10 min). Se activa recién al confirmar un código válido. */
export async function POST() {
  return handle(async () => {
    const userId = await requireUserId();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.twoFASecret) throw new DomainError(409, "2FA ya está activo");

    const secret = generateTotpSecret();
    await redis.set(`2fa:pending:${userId}`, sealString(secret, `2fa-pending:${userId}`), "EX", 600);
    const otpauth = totpKeyUri(user.email, secret);
    const qr = await QRCode.toDataURL(otpauth);
    return NextResponse.json({ qr, secret });
  });
}
