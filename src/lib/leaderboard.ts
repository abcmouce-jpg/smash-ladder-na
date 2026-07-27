import { prisma } from "@/lib/db";
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
    ...(filters.character ? { mainCharacter: filters.character } : {}),
    ...(filters.query ? { username: { contains: filters.query, mode: "insensitive" as const } } : {}),
    ...(filters.region ? { region: filters.region } : {}),
  };
  const [totalCount, players] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { rating: "desc" },
      select: { id: true, username: true, rating: true, gamesPlayed: true, mainCharacter: true },
      skip: pagination.skip,
      take: pagination.take,
    }),
  ]);
  return { players, totalCount };
}
