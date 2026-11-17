-- Turn the wait-widening opt-in off by default, and take back the default
-- that was imposed on everyone when the column was added a day earlier.
--
-- The UPDATE is deliberate and is not a backfill of a choice: every `true` in
-- this column was written by the ADD COLUMN default on 2026-11-14, not by a
-- player, so there is no preference being overwritten. The nine accounts that
-- had explicitly switched it off are already false and are untouched. Anyone
-- who wants it is one checkbox away, in Match settings on the lobby and in
-- Settings > Lobby.

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "widenFiltersWhileWaiting" SET DEFAULT false;

UPDATE "User" SET "widenFiltersWhileWaiting" = false WHERE "widenFiltersWhileWaiting" = true;
