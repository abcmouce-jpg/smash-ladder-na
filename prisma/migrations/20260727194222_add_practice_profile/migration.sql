-- AlterTable
ALTER TABLE "RatingLobbyEntry" ADD COLUMN     "isPracticing" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RatingMatch" ADD COLUMN     "player1IsPracticing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "player2IsPracticing" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avoidPracticeOpponents" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "practiceGamesPlayed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "practiceRating" INTEGER NOT NULL DEFAULT 1500;
