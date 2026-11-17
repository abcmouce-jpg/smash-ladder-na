-- The default radius only, for accounts created from here on. Nothing
-- already stored is touched: 2,400 km is both the value a player never
-- changed and the value a player deliberately picked, and the column
-- cannot tell the two apart, so a backfill would overwrite a real choice.

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "maxMatchDistanceKm" SET DEFAULT 5600;
