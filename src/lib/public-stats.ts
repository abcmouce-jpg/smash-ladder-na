import { prisma } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";

// Deliberately narrower than admin-stats.ts — no dispute/report/ban counts
// here, since this feeds the public homepage, not the mod dashboard.
export async function getPublicStats() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totalPlayers, matchesToday, topPlayers] = await Promise.all([
    prisma.user.count(),
    prisma.ratingMatch.count({
      where: { status: MatchStatus.CONFIRMED, confirmedAt: { gte: dayAgo } },
    }),
    prisma.user.findMany({
      where: { gamesPlayed: { gte: 10 } },
      orderBy: { rating: "desc" },
      take: 3,
      select: { id: true, username: true, avatarUrl: true, rating: true, gamesPlayed: true },
    }),
  ]);

  return { totalPlayers, matchesToday, topPlayers };
}
