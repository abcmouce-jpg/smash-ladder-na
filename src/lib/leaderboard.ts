import { prisma } from "@/lib/db";
import { UserStatus } from "@/generated/prisma/enums";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { echoGroupMembers, type SmashCharacter } from "@/lib/characters";
import { expandRegionForSearch, expandCountryForSearch, type MatchCountry } from "@/lib/regions";

export interface LeaderboardFilters {
  character?: string | null;
  query?: string | null;
  region?: string | null;
  country?: MatchCountry | null;
}

// The base "who counts as a ranked player" population shared by the
// leaderboard query and the rank computation so neither can drift from the
// other. A banned account still has its old rating on record, but it has no
// business showing up on the public leaderboard anymore. Discord username
// shows as this literal string once someone deletes their Discord account —
// happens independently of any ban, so an otherwise-ACTIVE account can still
// be stuck showing this. Nothing useful to link to at that point either way.
function leaderboardEligibility(query?: string | null) {
  return {
    gamesPlayed: { gte: LEADERBOARD_MIN_GAMES },
    status: { not: UserStatus.BANNED },
    // Combined into one filter object with the search query below — a second
    // `username` key would just silently clobber this exclusion whenever a
    // search term is also present, since object spread overwrites same-name
    // keys.
    username: {
      not: "Deleted User",
      ...(query ? { contains: query, mode: "insensitive" as const } : {}),
    },
  };
}

// Shared by the interactive /leaderboard page and the /stream broadcast
// overlay so both agree on what counts as "ranked" and rank the same way.
export async function getLeaderboardPlayers(
  filters: LeaderboardFilters,
  pagination: { skip?: number; take?: number } = {},
) {
  const where = {
    ...leaderboardEligibility(filters.query),
    // A character's leaderboard shows its mains and anyone with it as a
    // secondary. Auto-derived secondaries already require >=30% of a
    // player's games to exist at all (see recomputeCharacterUsage), so this
    // never grants a spot off a one-off pick. Echo fighters (Lucina/Marth,
    // Daisy/Peach, etc.) count as the same character here — filtering by
    // either side of an echo pair pulls in both, since they're functionally
    // the same fighter.
    ...(filters.character
      ? {
          OR: echoGroupMembers(filters.character as SmashCharacter).flatMap((c) => [
            { mainCharacter: c },
            { secondaryCharacters: { has: c } },
          ]),
        }
      : {}),
    // A broad region (e.g. "USA East") also matches players who set a
    // specific state/province within it, not just an exact string match.
    // Region and country are mutually exclusive in the UI (picking one
    // clears the other) — region wins here only as a defensive fallback if
    // both somehow end up set, since it's the more specific of the two.
    ...(filters.region
      ? { region: { in: expandRegionForSearch(filters.region) } }
      : filters.country
        ? { region: { in: expandCountryForSearch(filters.country) } }
        : {}),
  };
  const [totalCount, players] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      // A rating-only sort leaves ties in DB-dependent (effectively
      // undefined) order — harmless for a single unpaginated render, but
      // skip/take pagination over an unstable order can duplicate or drop a
      // tied row across page boundaries. `id` is a stable, arbitrary
      // tiebreaker that just needs to be consistent, not meaningful.
      orderBy: [{ rating: "desc" }, { id: "asc" }],
      select: {
        id: true,
        username: true,
        rating: true,
        gamesPlayed: true,
      },
      skip: pagination.skip,
      take: pagination.take,
    }),
  ]);
  return { players, totalCount };
}

// 1-based rank on the public leaderboard for a player, plus how many players
// qualify for it, or null rank when they don't qualify yet (under the games
// floor, banned, or the Discord self-deletion placeholder). Shared by the
// profile's season card and the stream overlay so the `#X/Y` everyone sees
// agrees. Uses the same eligible population as getLeaderboardPlayers but
// standard competition ranking: tied players all get the same rank (count of
// strictly-higher ratings + 1), with the next rank skipped.
export async function getLeaderboardRank(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { rating: true, gamesPlayed: true, status: true, username: true },
  });

  const eligible = leaderboardEligibility();
  const [totalPlayers, above] = await Promise.all([
    prisma.user.count({ where: eligible }),
    user
      ? prisma.user.count({
          where: {
            ...eligible,
            rating: { gt: user.rating },
          },
        })
      : Promise.resolve(0),
  ]);

  const qualifies =
    user !== null &&
    user.status !== UserStatus.BANNED &&
    user.username !== "Deleted User" &&
    user.gamesPlayed >= LEADERBOARD_MIN_GAMES;

  return { rank: qualifies ? above + 1 : null, totalPlayers };
}
