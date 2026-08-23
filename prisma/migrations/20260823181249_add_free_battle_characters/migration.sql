-- AlterTable
ALTER TABLE "FreeBattlePost" ADD COLUMN     "characters" TEXT[] DEFAULT ARRAY[]::TEXT[];
