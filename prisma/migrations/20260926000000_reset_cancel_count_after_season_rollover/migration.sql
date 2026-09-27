-- The preseason rolled over into Season 1 on 2026-09-25. That rollover reset
-- User.gamesPlayed to 0 but left User.cancelCount at each player's old total
-- (endActiveSeasonAndStartNext has since been fixed to reset both together).
-- Because the auto-suspend check compares the two as a ratio
-- (cancelCount / (cancelCount + gamesPlayed)), a stale cancel total against a
-- reset game count reads as a 100% cancel rate — flagging and auto-suspending
-- players who'd merely cancelled earlier, and re-suspending them every time
-- the 24h suspension lapses for the rest of the season.
--
-- Reset every player's cancel count to match the fresh season, exactly as the
-- now-fixed rollover would have.
UPDATE "User"
SET "cancelCount" = 0;
