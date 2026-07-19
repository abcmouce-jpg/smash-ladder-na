import { prisma } from "@/lib/db";
import { ReportStatus } from "@/generated/prisma/enums";

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
      reportedUser: { select: { id: true, username: true, status: true } },
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

export async function actionReport(
  reportId: string,
  newStatus: "SUSPENDED" | "BANNED",
) {
  const report = await prisma.conductReport.findUnique({ where: { id: reportId } });
  if (!report) throw new Error("Report not found");

  await prisma.$transaction([
    prisma.user.update({ where: { id: report.reportedUserId }, data: { status: newStatus } }),
    prisma.conductReport.update({ where: { id: reportId }, data: { status: ReportStatus.ACTIONED } }),
  ]);
}
