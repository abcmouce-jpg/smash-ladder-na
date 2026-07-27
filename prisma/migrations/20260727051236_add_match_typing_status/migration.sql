-- CreateTable
CREATE TABLE "MatchTypingStatus" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastTypingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchTypingStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchTypingStatus_matchId_lastTypingAt_idx" ON "MatchTypingStatus"("matchId", "lastTypingAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchTypingStatus_matchId_userId_key" ON "MatchTypingStatus"("matchId", "userId");

-- AddForeignKey
ALTER TABLE "MatchTypingStatus" ADD CONSTRAINT "MatchTypingStatus_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "RatingMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
