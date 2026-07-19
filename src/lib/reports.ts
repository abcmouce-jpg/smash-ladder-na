import { prisma } from "@/lib/db";
import { ReportStatus, UserStatus } from "@/generated/prisma/enums";

export async function fileMatchReport(
  reporterId: string,
  matchId: string,
  reason: string,
) {
  const trimmed = reason.trim().slice(0, 1000);
  if (!trimmed) throw new Error("Please describe what happened");

  const match = await prisma.ratingMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Match not found");
  if (match.player1Id !== reporterId && match.player2Id !== reporterId) {
    throw new Error("Not a participant in this match");
  }
  const reportedUserId = match.player1Id === reporterId ? match.player2Id : match.player1Id;

  await prisma.conductReport.create({
    data: { matchId, reporterId, reportedUserId, reason: trimmed },
  });
}

export async function listOpenReports() {
  return prisma.conductReport.findMany({
    where: { status: ReportStatus.OPEN },
    orderBy: { createdAt: "desc" },
    include: {
      reporter: { select: { id: true, username: true } },
      reportedUser: {
        select: {
          id: true,
          username: true,
          status: true,
          misconductScore: true,
          _count: { select: { reportsReceived: true } },
        },
      },
      match: { select: { id: true } },
    },
  });
}

export async function dismissReport(reportId: string) {
  await prisma.conductReport.update({
    where: { id: reportId },
    data: { status: ReportStatus.DISMISSED },
  });
}

// Only a mod actually confirming a report moves the needle — filing one is
// free, so raw report counts would be trivial to game.
const MISCONDUCT_POINTS: Record<"SUSPENDED" | "BANNED", number> = {
  SUSPENDED: 2,
  BANNED: 5,
};

// A single report shouldn't be able to take someone's account down — require
// a pattern (any status counts, so previously-dismissed reports still show
// as part of a history) before a mod can actually suspend or ban.
export const ACTION_THRESHOLDS: Record<"SUSPENDED" | "BANNED", number> = {
  SUSPENDED: 3,
  BANNED: 5,
};

const STATUS_RANK: Record<UserStatus, number> = {
  [UserStatus.ACTIVE]: 0,
  [UserStatus.SUSPENDED]: 1,
  [UserStatus.BANNED]: 2,
};

export async function actionReport(reportId: string, newStatus: "SUSPENDED" | "BANNED") {
  const report = await prisma.conductReport.findUnique({ where: { id: reportId } });
  if (!report) throw new Error("Report not found");

  const totalReports = await prisma.conductReport.count({
    where: { reportedUserId: report.reportedUserId },
  });
  const threshold = ACTION_THRESHOLDS[newStatus];
  if (totalReports < threshold) {
    throw new Error(
      `This player has only been reported ${totalReports} time${totalReports === 1 ? "" : "s"} — ${newStatus.toLowerCase()} requires at least ${threshold}.`,
    );
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: report.reportedUserId },
    select: { status: true },
  });
  // A leftover OPEN report against an already-banned user shouldn't be able
  // to downgrade them back to suspended, or double-count misconduct points
  // for a decision that's already been made.
  const isEscalation = STATUS_RANK[newStatus] > STATUS_RANK[user.status];

  await prisma.$transaction([
    ...(isEscalation
      ? [
          prisma.user.update({
            where: { id: report.reportedUserId },
            data: { status: newStatus, misconductScore: { increment: MISCONDUCT_POINTS[newStatus] } },
          }),
        ]
      : []),
    // This user's standing has now been decided — close out every other
    // open report against them too, not just the one clicked, so the mod
    // queue doesn't keep resurfacing an already-actioned player.
    prisma.conductReport.updateMany({
      where: { reportedUserId: report.reportedUserId, status: ReportStatus.OPEN },
      data: { status: ReportStatus.ACTIONED },
    }),
  ]);
}
