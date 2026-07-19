-- CreateIndex
CREATE INDEX "RatingLobbyEntry_userId_joinedAt_idx" ON "RatingLobbyEntry"("userId", "joinedAt");

-- CreateIndex
CREATE INDEX "FreeBattlePost_authorId_idx" ON "FreeBattlePost"("authorId");
