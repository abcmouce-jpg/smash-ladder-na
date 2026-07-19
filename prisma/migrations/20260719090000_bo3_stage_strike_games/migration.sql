-- AlterTable
ALTER TABLE "RatingMatch" DROP COLUMN "finalStage",
DROP COLUMN "stageStrikeStarterId",
DROP COLUMN "stagesRemaining",
DROP COLUMN "struckStages";

-- CreateTable
CREATE TABLE "MatchGame" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "gameNumber" INTEGER NOT NULL,
    "actorAId" TEXT NOT NULL,
    "actorAStrikes" INTEGER NOT NULL,
    "actorBId" TEXT NOT NULL,
    "actorBStrikes" INTEGER NOT NULL,
    "stagesRemaining" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "struckStages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "finalStage" TEXT,
    "reportedWinnerId" TEXT,
    "reportedById" TEXT,
    "reportedAt" TIMESTAMP(3),
    "secondReportWinnerId" TEXT,
    "secondReportById" TEXT,
    "secondReportAt" TIMESTAMP(3),
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchGame_matchId_idx" ON "MatchGame"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchGame_matchId_gameNumber_key" ON "MatchGame"("matchId", "gameNumber");

-- AddForeignKey
ALTER TABLE "MatchGame" ADD CONSTRAINT "MatchGame_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "RatingMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

