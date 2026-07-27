-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twitchConnectedAt" TIMESTAMP(3),
ADD COLUMN     "twitchDisplayName" TEXT,
ADD COLUMN     "twitchProfileImageUrl" TEXT,
ADD COLUMN     "twitchUserId" TEXT,
ADD COLUMN     "twitchUsername" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_twitchUserId_key" ON "User"("twitchUserId");
