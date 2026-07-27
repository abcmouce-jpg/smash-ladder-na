-- AlterTable
ALTER TABLE "User" DROP COLUMN "startggUrl",
ADD COLUMN     "startggConnectedAt" TIMESTAMP(3),
ADD COLUMN     "startggGamerTag" TEXT,
ADD COLUMN     "startggSlug" TEXT,
ADD COLUMN     "startggUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_startggUserId_key" ON "User"("startggUserId");
