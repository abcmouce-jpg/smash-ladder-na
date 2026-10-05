import { prisma } from "@/lib/db";

const PAGE_SIZE = 25;

// Unlike getLeaderboardPlayers, this has no gamesPlayed floor and doesn't
// exclude banned accounts — a mod looking someone up needs to find brand
// new players (not yet qualified for the public leaderboard) and banned/
// suspended ones just as easily as top-ranked regulars.
export async function searchPlayersForAdmin(query: string, page = 1) {
  const trimmed = query.trim().slice(0, 32);
  const where = trimmed ? { username: { contains: trimmed, mode: "insensitive" as const } } : {};

  const [totalCount, players] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      // Newest signups first when browsing with no query — that's exactly
      // the "new guys aren't qualified for the leaderboard yet" case this
      // page exists for. A search narrows it down regardless of order.
      orderBy: trimmed ? { username: "asc" } : { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        rating: true,
        gamesPlayed: true,
        status: true,
        role: true,
        region: true,
        isSupporter: true,
        requireWiredOpponent: true,
        createdAt: true,
      },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return { players, totalCount, pageSize: PAGE_SIZE };
}
