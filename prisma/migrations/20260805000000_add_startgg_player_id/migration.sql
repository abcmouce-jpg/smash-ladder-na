-- AlterTable: start.gg's player id (currentUser.player.id), distinct from the
-- user id — the supermajor.gg profile link (?id=S...) keys off this one.
ALTER TABLE "User" ADD COLUMN "startggPlayerId" TEXT;
