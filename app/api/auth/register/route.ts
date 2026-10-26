import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError, handle } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase()),
  alias: z.string().regex(/^[a-zA-Z0-9_.]{3,24}$/, "Alias: 3-24 caracteres, letras, números, _ o ."),
  password: z.string().min(10, "Mínimo 10 caracteres").max(200),
});

export async function POST(req: Request) {
  return handle(async () => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    await enforceRateLimit(`register:${ip}`, 5, 60);

    const { email, alias, password } = schema.parse(await req.json());
    const exists = await prisma.user.findFirst({ where: { OR: [{ email }, { alias }] }, select: { id: true } });
    if (exists) throw new DomainError(409, "Email o alias ya registrados");

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: { email, alias, passwordHash, wallet: { create: {} } },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  });
}
