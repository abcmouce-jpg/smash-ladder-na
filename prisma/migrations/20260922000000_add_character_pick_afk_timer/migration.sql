-- Character picks no longer run on a starting auto-forfeit clock. The column
-- is renamed rather than dropped/re-added (Prisma's default diff) so live sets
-- keep the grace anchor they already have instead of all resetting to now().
-- AlterTable
ALTER TABLE "MatchGame" RENAME COLUMN "characterPickDeadline" TO "characterPickGraceUntil";

-- AlterTable
ALTER TABLE "MatchGame" ADD COLUMN     "afkTimerStartedById" TEXT,
ADD COLUMN     "afkTimerDeadline" TIMESTAMP(3);
