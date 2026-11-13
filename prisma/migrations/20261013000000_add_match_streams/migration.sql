-- CreateTable
CREATE TABLE "MatchStream" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "twitchUserId" TEXT NOT NULL,
    "twitchLogin" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vodId" TEXT,
    "vodOffsetSeconds" INTEGER,
    "vodResolvedAt" TIMESTAMP(3),
    "vodCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchStream_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchStream_matchId_idx" ON "MatchStream"("matchId");

-- CreateIndex
CREATE INDEX "MatchStream_userId_idx" ON "MatchStream"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchStream_matchId_userId_key" ON "MatchStream"("matchId", "userId");

-- AddForeignKey
ALTER TABLE "MatchStream" ADD CONSTRAINT "MatchStream_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "RatingMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchStream" ADD CONSTRAINT "MatchStream_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
