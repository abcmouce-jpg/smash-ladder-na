-- Backfill hideDiscordUsername for accounts deleted before that column
-- existed. deleteMyAccount now sets it at deletion time, but rows anonymized
-- beforehand still have it defaulted to false, leaving the ex-player's Discord
-- name visible on their profile. Match either of the two markers
-- deleteMyAccount writes: the generic username and the scrambled "deleted-"
-- discordId.
UPDATE "User"
SET "hideDiscordUsername" = true
WHERE "username" = 'Deleted User'
   OR "discordId" LIKE 'deleted-%';
