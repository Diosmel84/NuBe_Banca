import { randomUUID } from "node:crypto";
import { Prisma, type P2PTrade } from "@prisma/client";
import { fakeTronTxHash } from "@/lib/crypto";
import { DomainError } from "@/lib/errors";
import { COMMISSION_RATE, Decimal, round2 } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/**
 * Toda mutación de saldo usa updateMany con condición en el WHERE
 * (ej. usdtBalance >= monto). En Postgres eso es atómico bajo READ COMMITTED:
 * dos requests concurrentes no pueden gastar el mismo saldo dos veces.
 */

type Tx = Prisma.TransactionClient;

async function walletOrThrow(tx: Tx, userId: string) {
  const w = await tx.wallet.findUnique({ where: { userId } });
  if (!w) throw new DomainError(409, "Wallet inexistente");
  return w;
}

// ---------- Crear orden ----------

export interface CreateOrderInput {
  userId: string;
  type: "BUY" | "SELL";
  amount: Decimal;
  pricePerUsdt: Decimal;
  paymentMethod: string;
  minLimit?: Decimal;
  maxLimit?: Decimal;
}

export async function createOrder(input: CreateOrderInput) {
  const { userId, type, amount, minLimit, maxLimit } = input;
  if (minLimit && maxLimit && minLimit.gt(maxLimit)) throw new DomainError(400, "minLimit no puede superar maxLimit");
  if (minLimit && minLimit.gt(amount)) throw new DomainError(400, "minLimit no puede superar el monto");
  if (maxLimit && maxLimit.gt(amount)) throw new DomainError(400, "maxLimit no puede superar el monto");

  return prisma.$transaction(async (tx) => {
    if (type === "SELL") {
      // Disponible real = saldo libre - lo ya comprometido en otras órdenes SELL abiertas.
      const wallet = await walletOrThrow(tx, userId);
      const committed = await tx.p2POrder.aggregate({
        where: { userId, type: "SELL", status: "OPEN" },
        _sum: { amount: true },
      });
      const available = wallet.usdtBalance.minus(committed._sum.amount ?? 0);
      if (available.lt(amount)) {
        throw new DomainError(409, `Saldo insuficiente. Disponible para publicar: ${available.toFixed(2)} USDT`);
      }
    }
    return tx.p2POrder.create({
      data: {
        userId,
        type,
        amount,
        pricePerUsdt: input.pricePerUsdt,
        paymentMethod: input.paymentMethod,
        minLimit: minLimit ?? null,
        maxLimit: maxLimit ?? null,
      },
    });
  });
}

// ---------- Aceptar orden -> escrow ----------

export async function acceptOrder(orderId: string, takerId: string, requested?: Decimal): Promise<P2PTrade> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.p2POrder.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "OPEN") throw new DomainError(409, "La orden no está disponible");
    if (order.userId === takerId) throw new DomainError(400, "No podés tomar tu propia orden");

    const amount = requested ?? order.amount;
    if (amount.gt(order.amount)) throw new DomainError(400, "El monto supera lo disponible en la orden");
    if (order.minLimit && amount.lt(order.minLimit) && !amount.eq(order.amount)) {
      throw new DomainError(400, `Mínimo por operación: ${order.minLimit.toFixed(2)} USDT`);
    }
    if (order.maxLimit && amount.gt(order.maxLimit)) {
      throw new DomainError(400, `Máximo por operación: ${order.maxLimit.toFixed(2)} USDT`);
    }

    const sellerId = order.type === "SELL" ? order.userId : takerId;
    const buyerId = order.type === "SELL" ? takerId : order.userId;

    // 1) Consumir monto de la orden (condicional: evita doble toma concurrente).
    const consumed = await tx.p2POrder.updateMany({
      where: { id: orderId, status: "OPEN", amount: { gte: amount } },
      data: { amount: { decrement: amount } },
    });
    if (consumed.count !== 1) throw new DomainError(409, "La orden cambió, recargá e intentá de nuevo");
    const remaining = await tx.p2POrder.findUniqueOrThrow({ where: { id: orderId }, select: { amount: true } });
    if (remaining.amount.isZero()) {
      await tx.p2POrder.update({ where: { id: orderId }, data: { status: "IN_ESCROW" } });
    }

    // 2) Bloquear USDT del vendedor: usdtBalance -> lockedBalance.
    const locked = await tx.wallet.updateMany({
      where: { userId: sellerId, usdtBalance: { gte: amount } },
      data: { usdtBalance: { decrement: amount }, lockedBalance: { increment: amount } },
    });
    if (locked.count !== 1) throw new DomainError(409, "El vendedor no tiene saldo suficiente para el escrow");
    const sellerWallet = await walletOrThrow(tx, sellerId);

    // 3) Crear el trade. room de socket = tradeId; chatRoomId usa el mismo id.
    const id = randomUUID();
    const trade = await tx.p2PTrade.create({
      data: {
        id,
        chatRoomId: id,
        orderId,
        buyerId,
        sellerId,
        amount,
        totalArs: round2(amount.mul(order.pricePerUsdt)),
        commission: round2(amount.mul(COMMISSION_RATE)),
        escrowTxHash: fakeTronTxHash(),
      },
    });

    await tx.transaction.create({
      data: { userId: sellerId, type: "LOCK", amount, balanceAfter: sellerWallet.usdtBalance, referenceId: trade.id },
    });
    return trade;
  });
}

// ---------- Marcar pagado ----------

export async function markPaid(tradeId: string, buyerId: string, proofUrl: string): Promise<P2PTrade> {
  const res = await prisma.p2PTrade.updateMany({
    where: { id: tradeId, buyerId, status: "IN_ESCROW" },
    data: { status: "PAID", paymentProofUrl: proofUrl },
  });
  if (res.count !== 1) throw new DomainError(409, "Solo el comprador puede marcar como pagado un trade en escrow");
  return prisma.p2PTrade.findUniqueOrThrow({ where: { id: tradeId } });
}

// ---------- Liberar ----------

export async function releaseTrade(tradeId: string, sellerId: string): Promise<P2PTrade> {
  return prisma.$transaction(async (tx) => {
    // Transición condicional: el vendedor SOLO libera si el trade está en PAID.
    const moved = await tx.p2PTrade.updateMany({
      where: { id: tradeId, sellerId, status: "PAID" },
      data: { status: "RELEASED" },
    });
    if (moved.count !== 1) {
      throw new DomainError(409, "Solo el vendedor puede liberar, y únicamente con el trade en estado PAID");
    }
    const trade = await tx.p2PTrade.findUniqueOrThrow({ where: { id: tradeId } });
    const { amount, commission, buyerId } = trade;

    // Vendedor: sale del locked.
    const debited = await tx.wallet.updateMany({
      where: { userId: sellerId, lockedBalance: { gte: amount } },
      data: { lockedBalance: { decrement: amount } },
    });
    if (debited.count !== 1) throw new DomainError(500, "Inconsistencia de escrow: locked insuficiente");
    const sellerWallet = await walletOrThrow(tx, sellerId);
    await tx.transaction.create({
      data: { userId: sellerId, type: "TRADE", amount: amount.neg(), balanceAfter: sellerWallet.usdtBalance, referenceId: tradeId },
    });

    // Comprador: recibe bruto y se le cobra la comisión (0.8%), dos asientos separados.
    const afterGross = await tx.wallet.upsert({
      where: { userId: buyerId },
      create: { userId: buyerId, usdtBalance: amount },
      update: { usdtBalance: { increment: amount } },
    });
    await tx.transaction.create({
      data: { userId: buyerId, type: "TRADE", amount, balanceAfter: afterGross.usdtBalance, referenceId: tradeId },
    });
    const afterFee = await tx.wallet.update({
      where: { userId: buyerId },
      data: { usdtBalance: { decrement: commission } },
    });
    await tx.transaction.create({
      data: { userId: buyerId, type: "COMMISSION", amount: commission.neg(), balanceAfter: afterFee.usdtBalance, referenceId: tradeId },
    });

    // Métricas de reputación.
    const minutes = Math.max(0, Math.round((Date.now() - trade.createdAt.getTime()) / 60000));
    const seller = await tx.user.findUniqueOrThrow({ where: { id: sellerId } });
    const n = seller.completedTrades;
    await tx.user.update({
      where: { id: sellerId },
      data: { completedTrades: { increment: 1 }, avgReleaseMinutes: Math.round((seller.avgReleaseMinutes * n + minutes) / (n + 1)) },
    });
    await tx.user.update({ where: { id: buyerId }, data: { completedTrades: { increment: 1 } } });

    // Si la orden quedó consumida y no le quedan trades activos, se cierra.
    const order = await tx.p2POrder.findUniqueOrThrow({ where: { id: trade.orderId } });
    if (order.amount.isZero()) {
      const active = await tx.p2PTrade.count({ where: { orderId: order.id, status: { not: "RELEASED" } } });
      if (active === 0) await tx.p2POrder.update({ where: { id: order.id }, data: { status: "RELEASED" } });
    }
    return trade;
  });
}

// ---------- Disputa ----------

export async function openDispute(tradeId: string, userId: string): Promise<P2PTrade> {
  const res = await prisma.p2PTrade.updateMany({
    where: {
      id: tradeId,
      status: { in: ["IN_ESCROW", "PAID"] },
      OR: [{ buyerId: userId }, { sellerId: userId }],
    },
    data: { status: "DISPUTED" },
  });
  if (res.count !== 1) throw new DomainError(409, "No se puede abrir disputa en este trade");
  // Los fondos quedan en lockedBalance hasta resolución manual (fuera del MVP).
  return prisma.p2PTrade.findUniqueOrThrow({ where: { id: tradeId } });
}

export { Decimal };
