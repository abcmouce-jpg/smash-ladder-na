-- Randitto: a queue that assigns both players a random fighter instead of
-- letting them pick. Recorded on the join and on the match so the mode's
-- actual use can be measured later rather than guessed at.
-- Additive with defaults, so every existing row reads as STANDARD and no
-- existing match flow changes.
-- CreateEnum
CREATE TYPE "MatchMode" AS ENUM ('STANDARD', 'RANDITTO');

-- AlterTable
ALTER TABLE "RatingLobbyEntry" ADD COLUMN     "mode" "MatchMode" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "RatingMatch" ADD COLUMN     "mode" "MatchMode" NOT NULL DEFAULT 'STANDARD';
