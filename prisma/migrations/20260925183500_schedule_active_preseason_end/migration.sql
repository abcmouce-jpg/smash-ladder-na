-- The preseason's end is announced up front (PRE_SEASON_EXPECTED_END_AT), and
-- launchPreSeasonIfDue now stamps it as the preseason's scheduledEndAt so the
-- finalize cron rolls it over automatically. The preseason currently active in
-- prod was created before Season.scheduledEndAt existed (and the launcher used
-- to pass null), so its scheduledEndAt is null and endActiveSeasonIfDue never
-- fires for it — leaving it sitting past its announced end until someone ends
-- it by hand. Backfill it to the same instant the code schedules, so the cron
-- picks it up on its next tick.
-- 2pm ET (EDT, UTC-4) on 2026-09-25 == 2026-09-25T18:00:00Z.
UPDATE "Season"
SET "scheduledEndAt" = '2026-09-25 18:00:00'
WHERE "name" = 'Preseason'
  AND "endsAt" IS NULL
  AND "scheduledEndAt" IS NULL;
