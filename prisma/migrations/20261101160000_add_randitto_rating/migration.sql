-- Randitto gets its own rating track rather than sharing the practice one.
-- Both exist to keep sets off the main ladder, but they answer different
-- questions — "how do I do when I am not trying" and "how do I do on whatever
-- I am handed" — and mixing them makes neither readable.
-- Additive with defaults, matching the practice columns, so every existing row
-- starts unrated on the new track.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "randittoRating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
                  ADD COLUMN     "randittoRatingDeviation" DOUBLE PRECISION NOT NULL DEFAULT 350,
                  ADD COLUMN     "randittoRatingVolatility" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
                  ADD COLUMN     "randittoGamesPlayed" INTEGER NOT NULL DEFAULT 0;
