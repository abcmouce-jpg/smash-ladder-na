import { prisma } from "@/lib/db";
import { LobbyEntryStatus, MatchStatus, ReportStatus, UserStatus } from "@/generated/prisma/enums";

export async function getAdminOverview() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
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
  ] = await Promise.all([
    prisma.user.count({ where: { updatedAt: { gte: dayAgo } } }),
    prisma.user.count(),
    prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
    prisma.user.count({ where: { status: UserStatus.BANNED } }),
    prisma.ratingMatch.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.ratingMatch.count({ where: { status: MatchStatus.DISPUTED } }),
    prisma.conductReport.count({ where: { status: ReportStatus.OPEN } }),
    prisma.ratingLobbyEntry.count({ where: { status: LobbyEntryStatus.WAITING } }),
    prisma.ratingLobbyEntry.count({ where: { status: LobbyEntryStatus.PAIRED } }),
    prisma.tournament.count({ where: { status: { in: ["SIGNUPS", "IN_PROGRESS"] } } }),
  ]);

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
