-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'IN_ESCROW', 'PAID', 'RELEASED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('IN_ESCROW', 'PAID', 'RELEASED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('LOCK', 'UNLOCK', 'DEPOSIT', 'WITHDRAWAL', 'TRADE', 'COMMISSION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "dniVerified" BOOLEAN NOT NULL DEFAULT false,
    "reputation" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "completedTrades" INTEGER NOT NULL DEFAULT 0,
    "avgReleaseMinutes" INTEGER NOT NULL DEFAULT 0,
    "twoFASecret" TEXT,
    "isJuanVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "usdtBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lockedBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "P2POrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "OrderType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "pricePerUsdt" DECIMAL(12,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "minLimit" DECIMAL(12,2),
    "maxLimit" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "P2POrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "P2PTrade" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "totalArs" DECIMAL(16,2) NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'IN_ESCROW',
    "escrowTxHash" TEXT,
    "paymentProofUrl" TEXT,
    "chatRoomId" TEXT NOT NULL,
    "commission" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "P2PTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "encryptedContent" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_alias_key" ON "User"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "P2POrder_status_type_idx" ON "P2POrder"("status", "type");

-- CreateIndex
CREATE INDEX "P2POrder_userId_idx" ON "P2POrder"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "P2PTrade_chatRoomId_key" ON "P2PTrade"("chatRoomId");

-- CreateIndex
CREATE INDEX "P2PTrade_buyerId_idx" ON "P2PTrade"("buyerId");

-- CreateIndex
CREATE INDEX "P2PTrade_sellerId_idx" ON "P2PTrade"("sellerId");

-- CreateIndex
CREATE INDEX "P2PTrade_orderId_idx" ON "P2PTrade"("orderId");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "ChatMessage_tradeId_createdAt_idx" ON "ChatMessage"("tradeId", "createdAt");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2POrder" ADD CONSTRAINT "P2POrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2PTrade" ADD CONSTRAINT "P2PTrade_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "P2POrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2PTrade" ADD CONSTRAINT "P2PTrade_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2PTrade" ADD CONSTRAINT "P2PTrade_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "P2PTrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================
-- Log contable inmutable: Transaction es append-only.
-- ============================================================
CREATE OR REPLACE FUNCTION transaction_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Transaction es inmutable: % no permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transaction_no_update_delete
  BEFORE UPDATE OR DELETE ON "Transaction"
  FOR EACH ROW EXECUTE FUNCTION transaction_immutable();

CREATE TRIGGER transaction_no_truncate
  BEFORE TRUNCATE ON "Transaction"
  FOR EACH STATEMENT EXECUTE FUNCTION transaction_immutable();

-- Saldos nunca negativos (defensa en profundidad además de los WHERE condicionales).
ALTER TABLE "Wallet" ADD CONSTRAINT wallet_balances_non_negative CHECK ("usdtBalance" >= 0 AND "lockedBalance" >= 0);
ALTER TABLE "P2POrder" ADD CONSTRAINT order_amount_non_negative CHECK ("amount" >= 0);
