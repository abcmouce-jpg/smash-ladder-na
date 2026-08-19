-- CreateEnum
CREATE TYPE "ConductAction" AS ENUM ('SUSPENDED', 'BANNED');

-- AlterTable
ALTER TABLE "ConductReport" ADD COLUMN     "actionSuspensionHours" INTEGER,
ADD COLUMN     "actionTaken" "ConductAction",
ADD COLUMN     "actionedAt" TIMESTAMP(3),
ADD COLUMN     "actionedById" TEXT;

-- AddForeignKey
ALTER TABLE "ConductReport" ADD CONSTRAINT "ConductReport_actionedById_fkey" FOREIGN KEY ("actionedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
