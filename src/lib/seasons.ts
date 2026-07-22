import { prisma } from "@/lib/db";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";

// Temporary: ending a season resets EVERYONE's rating, and enough people
// hold ADMIN now (mostly for community/promotion reasons, not moderation)
// that this narrows who can trigger it, independent of the ADMIN/MOD role
// check. Revisit once ADMIN grants are reviewed.
export const SEASON_MANAGER_USER_ID = process.env.SEASON_MANAGER_USER_ID?.trim() || null;

export async function getActiveSeason() {
  return prisma.season.findFirst({ where: { endsAt: null }, orderBy: { startsAt: "desc" } });
}

// Used at match-confirm time; creates Season 1 on first use so the app
// doesn't need a manual setup step before matches can be rated.
export async function ensureActiveSeason() {
  const existing = await getActiveSeason();
  if (existing) return existing;
  return prisma.season.create({ data: { name: "Season 1" } });
}

export async function listPastSeasons() {
  return prisma.season.findMany({
    where: { endsAt: { not: null } },
    orderBy: { startsAt: "desc" },
  });
}

export async function getSeasonStandings(seasonId: string) {
  return prisma.seasonStanding.findMany({
    where: { seasonId },
    orderBy: { rank: "asc" },
    include: { user: { select: { id: true, username: true } } },
  });
}

// Snapshots the current leaderboard as this season's final standings, then
// resets rating/gamesPlayed for everyone so the next season starts fresh —
// a full reset rather than a soft regression toward the mean, to keep the
// rollover simple and predictable.
export async function endActiveSeasonAndStartNext(nextName?: string) {
  const active = await getActiveSeason();
  if (!active) throw new Error("No active season");

  const standings = await prisma.user.findMany({
    where: { gamesPlayed: { gte: LEADERBOARD_MIN_GAMES } },
    orderBy: { rating: "desc" },
    select: { id: true, rating: true, gamesPlayed: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.season.update({ where: { id: active.id }, data: { endsAt: new Date() } });

    if (standings.length > 0) {
      await tx.seasonStanding.createMany({
        data: standings.map((s, i) => ({
          seasonId: active.id,
          userId: s.id,
          finalRating: s.rating,
          gamesPlayed: s.gamesPlayed,
          rank: i + 1,
        })),
      });
    }

    await tx.user.updateMany({ data: { rating: 1500, gamesPlayed: 0 } });

    const seasonCount = await tx.season.count();
    await tx.season.create({ data: { name: nextName ?? `Season ${seasonCount + 1}` } });
  });
}
