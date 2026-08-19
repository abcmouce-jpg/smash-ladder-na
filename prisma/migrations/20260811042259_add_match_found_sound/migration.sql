-- CreateEnum
CREATE TYPE "MatchFoundSound" AS ENUM ('CHIME', 'ANNOUNCER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "matchFoundSound" "MatchFoundSound" NOT NULL DEFAULT 'CHIME';
