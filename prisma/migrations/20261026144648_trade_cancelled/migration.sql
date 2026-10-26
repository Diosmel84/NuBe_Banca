-- AlterEnum
ALTER TYPE "TradeStatus" ADD VALUE 'CANCELLED';

-- CreateIndex
CREATE INDEX "P2PTrade_status_createdAt_idx" ON "P2PTrade"("status", "createdAt");
