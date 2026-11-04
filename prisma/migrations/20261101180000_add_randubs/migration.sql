-- Random doubles. Rides the existing two-side shape rather than a parallel
-- model: player1/player2 are the two sides and the partner columns are each
-- side's second member, so reporting, disputes, timeouts and cancellation
-- keep working unchanged. Null for every 1v1 mode.
-- AlterEnum
ALTER TYPE "MatchMode" ADD VALUE 'RANDUBS';

-- AlterTable
ALTER TABLE "RatingMatch" ADD COLUMN     "player1PartnerId" TEXT,
                          ADD COLUMN     "player2PartnerId" TEXT;

-- Its own rating track, like randitto's: a result earned with a teammate you
-- were assigned is not a measurement of the 1v1 ladder.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "randubsRating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
                  ADD COLUMN     "randubsRatingDeviation" DOUBLE PRECISION NOT NULL DEFAULT 350,
                  ADD COLUMN     "randubsRatingVolatility" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
                  ADD COLUMN     "randubsGamesPlayed" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "RatingMatch" ADD CONSTRAINT "RatingMatch_player1PartnerId_fkey" FOREIGN KEY ("player1PartnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RatingMatch" ADD CONSTRAINT "RatingMatch_player2PartnerId_fkey" FOREIGN KEY ("player2PartnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
