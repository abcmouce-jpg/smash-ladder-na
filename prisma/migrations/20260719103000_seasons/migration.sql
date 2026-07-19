-- AlterTable
ALTER TABLE "RatingMatch" ADD COLUMN     "seasonId" TEXT;

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonStanding" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "finalRating" INTEGER NOT NULL,
    "gamesPlayed" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "SeasonStanding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Season_endsAt_idx" ON "Season"("endsAt");

-- CreateIndex
CREATE INDEX "SeasonStanding_seasonId_rank_idx" ON "SeasonStanding"("seasonId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonStanding_seasonId_userId_key" ON "SeasonStanding"("seasonId", "userId");

-- AddForeignKey
ALTER TABLE "RatingMatch" ADD CONSTRAINT "RatingMatch_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonStanding" ADD CONSTRAINT "SeasonStanding_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonStanding" ADD CONSTRAINT "SeasonStanding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

