-- AlterTable
ALTER TABLE "User" ADD COLUMN     "supporterCode" TEXT,
ADD COLUMN     "supporterExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "KofiDonation" ADD COLUMN     "matchedUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_supporterCode_key" ON "User"("supporterCode");

-- AddForeignKey
ALTER TABLE "KofiDonation" ADD CONSTRAINT "KofiDonation_matchedUserId_fkey" FOREIGN KEY ("matchedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
