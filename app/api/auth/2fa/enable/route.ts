import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { openString } from "@/lib/crypto";
import { DomainError, handle } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";
import { sealTotpSecret, verifyRawTotp } from "@/lib/totp";

const schema = z.object({ code: z.string() });

export async function POST(req: Request) {
  return handle(async () => {
    const userId = await requireUserId();
    await enforceRateLimit(`2fa-enable:${userId}`, 5, 60);
    const { code } = schema.parse(await req.json());

    const pending = await redis.get(`2fa:pending:${userId}`);
    if (!pending) throw new DomainError(410, "El setup expiró, generá un QR nuevo");
    const secret = openString(pending, `2fa-pending:${userId}`);
    if (!verifyRawTotp(secret, code)) throw new DomainError(400, "Código incorrecto");

    const res = await prisma.user.updateMany({
      where: { id: userId, twoFASecret: null },
      data: { twoFASecret: sealTotpSecret(userId, secret) },
    });
    if (res.count !== 1) throw new DomainError(409, "2FA ya está activo");
    await redis.del(`2fa:pending:${userId}`);
    return NextResponse.json({ ok: true });
  });
}
