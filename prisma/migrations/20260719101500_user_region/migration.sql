-- AlterTable
ALTER TABLE "User" ADD COLUMN     "region" TEXT;

-- CreateIndex
CREATE INDEX "User_region_idx" ON "User"("region");

