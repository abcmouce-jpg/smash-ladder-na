import { NextResponse } from "next/server";
import { getRankingsForExport } from "@/lib/leaderboard";
import { getActiveSeason } from "@/lib/seasons";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { RATING_SYSTEM, SITE_NAME } from "@/lib/site";

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

function clampInt(raw: string | null, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = clampInt(searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);

  const [season, { players, totalCount }] = await Promise.all([getActiveSeason(), getRankingsForExport(limit, offset)]);

  return NextResponse.json({
    site: SITE_NAME,
    season: season ? { name: season.name, startsAt: season.startsAt, scheduledEndAt: season.scheduledEndAt } : null,
    ratingSystem: RATING_SYSTEM,
    // Stated so a consumer doesn't have to infer why a player it expected is
    // absent, and doesn't treat an unranked player as rating 0.
    minimumSetsToRank: LEADERBOARD_MIN_GAMES,
    totalCount,
    limit,
    offset,
    players,
  });
}
