-- YouTube becomes a first-class streaming platform, detected automatically via
-- the player's own Google OAuth grant rather than a link they paste. The
-- "streaming right now" declaration (liveStreamUrl/liveStreamAt) and the manual
-- youtubeChannelUrl are replaced by the connected account below.
--
-- Why OAuth solves what the old declaration worked around: the YouTube Data
-- API's search.list costs 100 quota units per call against a default 10,000/day
-- allowance, which can't poll a feed. liveBroadcasts.list with mine=true uses
-- the player's own token and costs 1 unit, so a linked channel can be checked
-- the same way a Twitch channel is.

-- Drop the self-declared stream columns. Their partial index goes with
-- liveStreamAt.
ALTER TABLE "User" DROP COLUMN "youtubeChannelUrl";
ALTER TABLE "User" DROP COLUMN "liveStreamUrl";
ALTER TABLE "User" DROP COLUMN "liveStreamAt";

-- Connected YouTube identity + tokens.
ALTER TABLE "User" ADD COLUMN     "youtubeUserId" TEXT,
ADD COLUMN     "youtubeChannelTitle" TEXT,
ADD COLUMN     "youtubeProfileImageUrl" TEXT,
ADD COLUMN     "youtubeConnectedAt" TIMESTAMP(3),
ADD COLUMN     "youtubeRefreshToken" TEXT,
ADD COLUMN     "youtubeAccessToken" TEXT,
ADD COLUMN     "youtubeAccessTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_youtubeUserId_key" ON "User"("youtubeUserId");

-- MatchStream was Twitch-only. Rename its identity columns to platform-neutral
-- names and record which platform each row belongs to. Existing rows are all
-- Twitch, hence the default.
CREATE TYPE "StreamPlatform" AS ENUM ('TWITCH', 'YOUTUBE');

ALTER TABLE "MatchStream" RENAME COLUMN "twitchUserId" TO "platformUserId";
ALTER TABLE "MatchStream" RENAME COLUMN "twitchLogin" TO "platformLogin";

ALTER TABLE "MatchStream" ADD COLUMN "platform" "StreamPlatform" NOT NULL DEFAULT 'TWITCH';

-- A player can be live on both platforms for the same set, so platform is part
-- of the row's identity rather than collapsing the two captures into one.
DROP INDEX "MatchStream_matchId_userId_key";
CREATE UNIQUE INDEX "MatchStream_matchId_userId_platform_key" ON "MatchStream"("matchId", "userId", "platform");
