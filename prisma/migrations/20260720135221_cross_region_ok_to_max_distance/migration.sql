-- AlterTable: replace the boolean cross-region opt-in with a distance radius (km).
-- NULL means worldwide (equivalent to the old crossRegionOk = true).
ALTER TABLE "User" ADD COLUMN "maxMatchDistanceKm" INTEGER DEFAULT 5000;

-- Backfill from the old column before dropping it.
UPDATE "User" SET "maxMatchDistanceKm" = NULL WHERE "crossRegionOk" = true;

ALTER TABLE "User" DROP COLUMN "crossRegionOk";
