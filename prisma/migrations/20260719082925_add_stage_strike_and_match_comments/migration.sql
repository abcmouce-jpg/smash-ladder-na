-- AlterTable
ALTER TABLE "RatingMatch" ADD COLUMN     "finalStage" TEXT,
ADD COLUMN     "stageStrikeStarterId" TEXT,
ADD COLUMN     "stagesRemaining" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "struckStages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "MatchComment" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchComment_matchId_createdAt_idx" ON "MatchComment"("matchId", "createdAt");

-- AddForeignKey
ALTER TABLE "MatchComment" ADD CONSTRAINT "MatchComment_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "RatingMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchComment" ADD CONSTRAINT "MatchComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
