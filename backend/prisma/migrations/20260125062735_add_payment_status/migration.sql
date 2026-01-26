-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
