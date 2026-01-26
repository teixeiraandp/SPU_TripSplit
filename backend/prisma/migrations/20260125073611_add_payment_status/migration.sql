/*
  Warnings:

  - You are about to drop the column `declineReason` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `note` on the `Payment` table. All the data in the column will be lost.
  - Made the column `updatedAt` on table `Payment` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "Payment_status_idx";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "declineReason",
DROP COLUMN "note",
ADD COLUMN     "declineNote" TEXT,
ALTER COLUMN "updatedAt" SET NOT NULL;
