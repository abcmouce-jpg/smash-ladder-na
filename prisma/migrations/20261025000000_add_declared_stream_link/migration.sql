-- YouTube streams, which can't be detected the way Twitch ones are.
--
-- lib/twitch-helix.ts batches up to 100 channels into one Helix call, so
-- checking every player in the feed costs a single request. YouTube's only
-- equivalent is search.list at 100 quota units per channel per call against a
-- default 10,000/day — not enough to poll one channel every five minutes for
-- half a day. So a YouTube stream is declared by the player rather than
-- discovered, and the declaration carries a timestamp so a link someone
-- forgot to clear stops counting on its own (LIVE_DECLARATION_TTL_MS).
--
-- All three are nullable with no default: null means "not streaming" and
-- "no channel given", which is what every existing row means.
ALTER TABLE "User" ADD COLUMN "youtubeChannelUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "liveStreamUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "liveStreamAt" TIMESTAMP(3);

-- The feed asks "who declared a stream recently", never "who declared this
-- URL", so the index is on the timestamp. Partial because the column is null
-- for everyone not currently streaming, which is nearly every row.
CREATE INDEX "User_liveStreamAt_idx" ON "User"("liveStreamAt") WHERE "liveStreamAt" IS NOT NULL;
