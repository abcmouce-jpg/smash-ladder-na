import { prisma } from "@/lib/db";
import { UserStatus } from "@/generated/prisma/enums";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";

export interface LeaderboardFilters {
  character?: string | null;
  query?: string | null;
  region?: string | null;
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
    // Matches either the peer-reported main character or any accumulated
    // secondary — otherwise a player who mains two characters only ever
    // shows up under whichever one an opponent happened to report first.
    ...(filters.character
      ? { OR: [{ mainCharacter: filters.character }, { secondaryCharacters: { has: filters.character } }] }
      : {}),
    ...(filters.region ? { region: filters.region } : {}),
  };
  const [totalCount, players] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { rating: "desc" },
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
