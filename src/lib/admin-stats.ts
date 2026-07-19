import { prisma } from "@/lib/db";
import { LobbyEntryStatus, ReportStatus, UserStatus } from "@/generated/prisma/enums";

export async function getAdminOverview() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    activeUsers24h,
    totalUsers,
    suspendedUsers,
    bannedUsers,
    matchesToday,
    disputedGameCandidates,
    openReports,
    lobbyWaiting,
    lobbyPaired,
    openTournaments,
  ] = await Promise.all([
    prisma.user.count({ where: { updatedAt: { gte: dayAgo } } }),
    prisma.user.count(),
    prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
    prisma.user.count({ where: { status: UserStatus.BANNED } }),
    prisma.ratingMatch.count({ where: { createdAt: { gte: dayAgo } } }),
    // A disputed game no longer flips the whole match to a blocking status
    // — "disputed" now lives at the game level (winnerId still null, but
    // both a report and a conflicting second report exist). Prisma can't
    // compare two columns in a where clause, so the not-equal check happens
    // in JS below on this narrowed-down candidate set.
    prisma.matchGame.findMany({
      where: { winnerId: null, reportedWinnerId: { not: null }, secondReportWinnerId: { not: null } },
      select: { reportedWinnerId: true, secondReportWinnerId: true },
    }),
    prisma.conductReport.count({ where: { status: ReportStatus.OPEN } }),
    prisma.ratingLobbyEntry.count({ where: { status: LobbyEntryStatus.WAITING } }),
    prisma.ratingLobbyEntry.count({ where: { status: LobbyEntryStatus.PAIRED } }),
    prisma.tournament.count({ where: { status: { in: ["SIGNUPS", "IN_PROGRESS"] } } }),
  ]);

  const openDisputes = disputedGameCandidates.filter(
    (g) => g.reportedWinnerId !== g.secondReportWinnerId,
  ).length;

  return {
    activeUsers24h,
    totalUsers,
    suspendedUsers,
    bannedUsers,
    matchesToday,
    openDisputes,
    openReports,
    lobbyWaiting,
    lobbyPaired,
    openTournaments,
  };
}
