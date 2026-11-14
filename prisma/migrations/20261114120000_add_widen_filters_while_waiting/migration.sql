-- Opt-in (default on) for letting a player's own match-distance and
-- rating-gap filters loosen a notch at a time while they sit in the queue
-- with nobody to pair with. The default applies to existing rows as well as
-- new ones, deliberately: a column nobody has ever set holds no choice to
-- preserve, and the widening is bounded (three notches, never past the last
-- finite preset) and only ever happens after the player's own settings have
-- already failed to find anyone.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "widenFiltersWhileWaiting" BOOLEAN NOT NULL DEFAULT true;
