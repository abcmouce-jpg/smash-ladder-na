-- AlterTable: self-declared rating-gap matching radius. NULL (any rating) by
-- default so existing players' match pool doesn't shrink until they opt in.
ALTER TABLE "User" ADD COLUMN "maxRatingGap" INTEGER;
