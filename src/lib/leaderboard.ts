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

// Shared by the interactive /leaderboard page and the /stream broadcast
// overlay so both agree on what counts as "ranked" and rank the same way.
export async function getLeaderboardPlayers(
  filters: LeaderboardFilters,
  pagination: { skip?: number; take?: number } = {},
) {
  const where = {
    gamesPlayed: { gte: LEADERBOARD_MIN_GAMES },
    // A banned account still has its old rating on record, but it has no
    // business showing up on the public leaderboard anymore.
    status: { not: UserStatus.BANNED },
    // Discord username shows as this literal string once someone deletes
    // their Discord account — happens independently of any ban, so an
    // otherwise-ACTIVE account can still be stuck showing this. Nothing
    // useful to link to at that point either way. Combined into one filter
    // object with the search query below — a second `username` key here
    // would just silently clobber this exclusion whenever a search term is
    // also present, since object spread overwrites same-name keys.
    username: {
      not: "Deleted User",
      ...(filters.query ? { contains: filters.query, mode: "insensitive" as const } : {}),
    },
    // A character's leaderboard shows its mains and anyone with it as a
    // secondary. Auto-derived secondaries already require >10% of a
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
        mainCharacter: true,
        secondaryCharacters: true,
      },
      skip: pagination.skip,
      take: pagination.take,
    }),
  ]);
  return { players, totalCount };
}
