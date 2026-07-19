-- CreateIndex
CREATE INDEX "RatingMatch_player1Id_status_confirmedAt_idx" ON "RatingMatch"("player1Id", "status", "confirmedAt");

-- CreateIndex
CREATE INDEX "RatingMatch_player2Id_status_confirmedAt_idx" ON "RatingMatch"("player2Id", "status", "confirmedAt");
