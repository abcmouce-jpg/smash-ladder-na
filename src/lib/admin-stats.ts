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
    matchesTotal,
    disputedGameCandidates,
    openReports,
    lobbyWaiting,
    matchesInProgress,
  ] = await Promise.all([
    // lastSignInAt, not updatedAt — updatedAt is bumped by any write to the
    // row at all (a rating change, an admin backfill, anything), so it was
    // wildly overcounting "active" for anyone touched by something other
    // than actually signing in. lastSignInAt only ever moves in auth.ts's
    // signIn callback.
    prisma.user.count({ where: { lastSignInAt: { gte: dayAgo } } }),
    prisma.user.count(),
    prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
    prisma.user.count({ where: { status: UserStatus.BANNED } }),
    // CONFIRMED + confirmedAt, not createdAt — matches getPublicStats's
    // definition on the homepage. This used to count every match *created*
    // in the window regardless of status (including still-in-progress or
    // cancelled ones), which gave a different number than the public
    // "matches today" stat for the same rolling 24h window.
    prisma.ratingMatch.count({
      where: { status: MatchStatus.CONFIRMED, confirmedAt: { gte: dayAgo } },
    }),
    // Every match ever created, any status — includes CANCELLED/EXPIRED
    // ones too, unlike matchesToday's rolling window above.
    prisma.ratingMatch.count(),
    // A disputed game no longer flips the whole match to a blocking status
    // — "disputed" now lives at the game level (winnerId still null, but
    // both a report and a conflicting second report exist). Prisma can't
    // compare two columns in a where clause, so the not-equal check happens
    // in JS below on this narrowed-down candidate set. Only games actually
    // escalated to mods (disputeRequestedAt set) count — a fresh conflict
    // the players are still reconciling isn't a mod task yet. Excludes
    // games whose match already CONFIRMED/CANCELLED via its other games —
    // same "moot" exclusion listDisputedGames uses, otherwise this count
    // only ever grows (nothing ever revisits a disputed game once its match
    // is closed out).
    prisma.matchGame.findMany({
      where: {
        winnerId: null,
        reportedWinnerId: { not: null },
        secondReportWinnerId: { not: null },
        disputeRequestedAt: { not: null },
        match: { status: { notIn: [MatchStatus.CONFIRMED, MatchStatus.CANCELLED] } },
      },
      select: { reportedWinnerId: true, secondReportWinnerId: true },
    }),
    prisma.conductReport.count({ where: { status: ReportStatus.OPEN } }),
    prisma.ratingLobbyEntry.count({ where: { status: LobbyEntryStatus.WAITING } }),
    // Not a lobby-entry count: RatingLobbyEntry.status never transitions off
    // PAIRED once a match is created (see getActiveLobbyEntry's "orphaned
    // PAIRED entry" handling), so that count only ever grows and never
    // reflects matches that have since finished. Counting the match's own
    // still-live statuses instead is the only way this number ever goes back
    // down.
    prisma.ratingMatch.count({
      where: { status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED, MatchStatus.DISPUTED] } },
    }),
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
    matchesTotal,
    openDisputes,
    openReports,
    lobbyWaiting,
    matchesInProgress,
  };
}
