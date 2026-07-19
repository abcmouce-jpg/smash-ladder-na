-- DropForeignKey
ALTER TABLE "TournamentMatch" DROP CONSTRAINT "TournamentMatch_player1EntryId_fkey";

-- DropForeignKey
ALTER TABLE "TournamentMatch" DROP CONSTRAINT "TournamentMatch_player2EntryId_fkey";

-- DropForeignKey
ALTER TABLE "TournamentMatch" DROP CONSTRAINT "TournamentMatch_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "TournamentMatch" DROP CONSTRAINT "TournamentMatch_winnerEntryId_fkey";

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "startggUrl" TEXT;

-- AlterTable
ALTER TABLE "TournamentEntry" DROP COLUMN "seed";

-- DropTable
DROP TABLE "TournamentMatch";

