import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Credenciales SOLO de desarrollo.
const DEMO_PASSWORD = "JuanDemo2024!";

async function upsertUser(email: string, alias: string, balance: string, isJuanVerified: boolean) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, alias, passwordHash, isJuanVerified, dniVerified: isJuanVerified, wallet: { create: {} } },
  });
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
  if (wallet.usdtBalance.isZero() && Number(balance) > 0) {
    const after = await prisma.wallet.update({
      where: { userId: user.id },
      data: { usdtBalance: new Prisma.Decimal(balance) },
    });
    await prisma.transaction.create({
      data: { userId: user.id, type: "DEPOSIT", amount: new Prisma.Decimal(balance), balanceAfter: after.usdtBalance, referenceId: "seed" },
    });
  }
  return user;
}

async function main() {
  const juan = await upsertUser("juan@demo.test", "juan_mecanico", "1000", true);
  const comprador = await upsertUser("comprador@demo.test", "comprador", "50", false);

  const hasOrders = await prisma.p2POrder.count({ where: { userId: juan.id } });
  if (!hasOrders) {
    await prisma.p2POrder.createMany({
      data: [
        { userId: juan.id, type: "SELL", amount: new Prisma.Decimal("500"), pricePerUsdt: new Prisma.Decimal("1235.50"), paymentMethod: "MercadoPago, Transferencia", minLimit: new Prisma.Decimal("10"), maxLimit: new Prisma.Decimal("200") },
        { userId: comprador.id, type: "BUY", amount: new Prisma.Decimal("100"), pricePerUsdt: new Prisma.Decimal("1220.00"), paymentMethod: "Transferencia" },
      ],
    });
  }
  console.log(`Seed OK. Usuarios: juan@demo.test / comprador@demo.test — password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
