-- Season 1's scheduled end was stamped from its own rollover instant (the
-- preseason rolled over at ~3:13pm ET on 2026-09-25), so it was due to end at
-- ~3:13pm ET on 2026-11-25 — and, because scheduledEndAt is stored as an
-- absolute UTC instant, an hour earlier than that (2:13pm ET) once EST took
-- over earlier that month. Every season now ends at 8pm ET on the 25th (see
-- nextSeasonEndAt in lib/seasons), so re-pin the running season to match.
-- 8pm ET (EST, UTC-5) on 2026-11-25 == 2026-11-26T01:00:00Z.
UPDATE "Season"
SET "scheduledEndAt" = '2026-11-26 01:00:00'
WHERE "name" = 'Season 1'
  AND "endsAt" IS NULL;
