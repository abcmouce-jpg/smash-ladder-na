import { NextResponse } from "next/server";
import { getRankingsForExport } from "@/lib/leaderboard";
import { getActiveSeason } from "@/lib/seasons";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { RatingAlgorithm } from "@/generated/prisma/enums";
import { SITE_NAME } from "@/lib/site";

// Public, read-only ranking export, built for SPSP: it seeds offline brackets
// and wants a player's online rating before it does. とさかず asked whether
// there was an easy API for this; this is it.
//
// Unauthenticated on purpose. Everything here is already on /leaderboard and
// the public profile pages — including the start.gg link, which each profile
// renders — so a key would guard nothing while making it harder for anyone to
// build against. The join key is start.gg's own OAuth-verified identifiers
// rather than a gamer tag, since two players can share a tag and only one can
// hold the account.
//
// Cached at the edge because a seeder polls on its own schedule and a bracket
// does not change between two requests a minute apart. `revalidate` is the
// whole control: Vercel rewrites Cache-Control to its own scheme from it, so
// setting that header here as well only looks like it does something.
export const revalidate = 60;

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

/**
 * The family a season's math belongs to, for the `ratingSystem` field.
 *
 * That field was `RATING_SYSTEM` — which is this instance's setting for the
 * NEXT season, not what rated the numbers in this response. The two differ
 * whenever a season is already running under different math, which is exactly
 * the case on an instance that changed its setting mid-season.
 *
 * Its value domain stays "elo" | "glicko2" so a consumer switching on it
 * doesn't meet a third string it has never seen. Smashmate's ladder is Elo
 * with a flat K, so "elo" is true of it at this resolution, and
 * `ratingAlgorithm` below carries the exact answer for anyone who needs it.
 */
export function ratingSystemFamily(algorithm: RatingAlgorithm | null): "elo" | "glicko2" {
  return algorithm === RatingAlgorithm.GLICKO2 ? "glicko2" : "elo";
}

function clampInt(raw: string | null, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = clampInt(searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);

  const [season, { players, totalCount, startggLinkedCount }] = await Promise.all([
    getActiveSeason(),
    getRankingsForExport(limit, offset),
  ]);

  return NextResponse.json({
    site: SITE_NAME,
    season: season ? { name: season.name, startsAt: season.startsAt, scheduledEndAt: season.scheduledEndAt } : null,
    ratingSystem: ratingSystemFamily(season?.algorithm ?? null),
    // The exact algorithm the ratings above were computed with, as the season
    // records it: "ELO", "GLICKO2" or "SMASHMATE". New field — `ratingSystem`
    // keeps its old two values so nothing reading it has to change.
    ratingAlgorithm: season?.algorithm ?? null,
    // Stated so a consumer doesn't have to infer why a player it expected is
    // absent, and doesn't treat an unranked player as rating 0.
    minimumSetsToRank: LEADERBOARD_MIN_GAMES,
    totalCount,
    // Of totalCount, how many carry a `startgg` object — i.e. how much of the
    // board can be joined to a bracket by id rather than by gamer tag.
    startggLinkedCount,
    limit,
    offset,
    players,
  });
}
