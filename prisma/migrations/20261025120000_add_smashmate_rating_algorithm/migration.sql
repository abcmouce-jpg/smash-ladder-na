-- Smashmate's rating math as its own algorithm: plain Elo with a flat K of 32
-- (no provisional tier), which is what reproduces the ±16 at equal ratings
-- that its players know. Additive only — existing ELO and GLICKO2 seasons are
-- untouched, and no season is migrated to it here.
ALTER TYPE "RatingAlgorithm" ADD VALUE 'SMASHMATE';
