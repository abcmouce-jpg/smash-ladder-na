import { prisma } from "@/lib/db";
import { ConductAction, ReportStatus, UserStatus } from "@/generated/prisma/enums";
import { isWiredClaimDisputedByOpponents, liftExpiredSuspension } from "@/lib/account";

export async function fileMatchReport(reporterId: string, matchId: string, reason: string) {
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

// One click, no reason required — connection quality isn't misconduct, so
// this never touches UserStatus or a mod queue. @@unique([matchId, reporterId])
// makes a repeat click a no-op instead of an error.
export async function fileConnectionReport(reporterId: string, matchId: string) {
  const match = await prisma.ratingMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Match not found");
  if (match.player1Id !== reporterId && match.player2Id !== reporterId) {
    throw new Error("Not a participant in this match");
  }
  const reportedUserId = match.player1Id === reporterId ? match.player2Id : match.player1Id;

  await prisma.connectionReport.upsert({
    where: { matchId_reporterId: { matchId, reporterId } },
    update: {},
    create: { matchId, reporterId, reportedUserId },
  });

  // A self-declared wired connection stops being credible once enough of a
  // player's actual opponents dispute it — same reasoning as cancelMatch
  // auto-clearing the flag once cancels pile up (see isWiredClaimUntrustworthy).
  const reported = await prisma.user.findUnique({
    where: { id: reportedUserId },
    select: { wiredConnection: true, gamesPlayed: true, _count: { select: { connectionReportsReceived: true } } },
  });
  if (
    reported?.wiredConnection &&
    isWiredClaimDisputedByOpponents(reported._count.connectionReportsReceived, reported.gamesPlayed)
  ) {
    await prisma.user.update({ where: { id: reportedUserId }, data: { wiredConnection: false } });
  }
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
          // blocksReceived is shown to mods as context, not counted toward
          // ACTION_THRESHOLDS — a block is unilateral and reason-free, so
          // weighting it like a filed report would make it gameable (mass-
          // block someone to help get them auto-banned).
          _count: { select: { reportsReceived: true, blocksReceived: true } },
        },
      },
      match: { select: { id: true } },
    },
  });
}

// Full history for a specific player — every status, not just OPEN — so a
// mod deciding whether to act (especially now that a single report is
// enough) can see the full pattern (or lack of one) first.
export async function listReportsForUser(userId: string) {
  return prisma.conductReport.findMany({
    where: { reportedUserId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      reporter: { select: { id: true, username: true } },
      actionedBy: { select: { id: true, username: true } },
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

// A mod's own judgment on a single report is enough to act — the gate
// exists to stop the button from being clickable with *zero* reports
// against someone, not to require a pattern. Full report history (count and
// each one's reason/status) stays visible on this page regardless, so a mod
// can still see whether this is a one-off or a repeat case before deciding.
export const ACTION_THRESHOLDS: Record<"SUSPENDED" | "BANNED", number> = {
  SUSPENDED: 1,
  BANNED: 1,
};

const STATUS_RANK: Record<UserStatus, number> = {
  [UserStatus.ACTIVE]: 0,
  [UserStatus.SUSPENDED]: 1,
  [UserStatus.BANNED]: 2,
};

// suspensionHours: null = indefinite (until a mod reinstates), a number =
// auto-lifts back to ACTIVE that many hours out (see liftExpiredSuspension
// in account.ts). Ignored for BANNED. skipThreshold is the "insta" path —
// bypasses ACTION_THRESHOLDS for a clear-cut case a mod wants to act on
// immediately rather than waiting for more reports to pile up.
export async function actionReport(
  reportId: string,
  modId: string,
  newStatus: "SUSPENDED" | "BANNED",
  options: { suspensionHours?: number | null; skipThreshold?: boolean } = {},
) {
  const report = await prisma.conductReport.findUnique({ where: { id: reportId } });
  if (!report) throw new Error("Report not found");

  if (!options.skipThreshold) {
    const totalReports = await prisma.conductReport.count({
      where: { reportedUserId: report.reportedUserId },
    });
    const threshold = ACTION_THRESHOLDS[newStatus];
    if (totalReports < threshold) {
      throw new Error(
        `This player has only been reported ${totalReports} time${totalReports === 1 ? "" : "s"} — ${newStatus.toLowerCase()} requires at least ${threshold} (or use Insta).`,
      );
    }
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: report.reportedUserId },
    select: { status: true, suspendedUntil: true },
  });
  // Lift a since-expired suspension first — otherwise a stale SUSPENDED
  // status (nothing had reason to lazily re-check it) makes a genuinely new
  // suspension look like a no-op downgrade-guard below instead of applying.
  const currentStatus = await liftExpiredSuspension(report.reportedUserId, user);
  // A leftover OPEN report against an already-banned user shouldn't be able
  // to downgrade them back to suspended, or double-count misconduct points
  // for a decision that's already been made. Re-applying the *same* level
  // (e.g. suspending someone who's already suspended) is allowed through —
  // that's a legitimate refresh/extension, not a downgrade.
  const isEscalation = STATUS_RANK[newStatus] >= STATUS_RANK[currentStatus];
  const suspendedUntil =
    newStatus === "SUSPENDED" && options.suspensionHours != null
      ? new Date(Date.now() + options.suspensionHours * 60 * 60 * 1000)
      : null;

  await prisma.$transaction([
    ...(isEscalation
      ? [
          prisma.user.update({
            where: { id: report.reportedUserId },
            data: { status: newStatus, suspendedUntil, misconductScore: { increment: MISCONDUCT_POINTS[newStatus] } },
          }),
        ]
      : []),
    // This user's standing has now been decided — close out every other
    // open report against them too, not just the one clicked, so the mod
    // queue doesn't keep resurfacing an already-actioned player. Every one
    // of them gets the same disposition recorded, since they're all being
    // resolved by this single decision.
    prisma.conductReport.updateMany({
      where: { reportedUserId: report.reportedUserId, status: ReportStatus.OPEN },
      data: {
        status: ReportStatus.ACTIONED,
        actionTaken: newStatus === "SUSPENDED" ? ConductAction.SUSPENDED : ConductAction.BANNED,
        actionedById: modId,
        actionedAt: new Date(),
        actionSuspensionHours: newStatus === "SUSPENDED" ? (options.suspensionHours ?? null) : null,
      },
    }),
  ]);
}

// Direct mod action against a player with no existing ConductReport required
// (the "insta" tool) — still recorded as an ACTIONED ConductReport (mod as
// reporter) so it shows up in the same misconduct-history count as anything
// else, rather than being an invisible side channel.
export async function moderateUserDirectly(
  modId: string,
  userId: string,
  action: "SUSPEND" | "BAN" | "REINSTATE",
  options: { reason?: string; suspensionHours?: number | null } = {},
) {
  if (action === "REINSTATE") {
    await prisma.user.update({ where: { id: userId }, data: { status: UserStatus.ACTIVE, suspendedUntil: null } });
    return;
  }

  const newStatus = action === "SUSPEND" ? UserStatus.SUSPENDED : UserStatus.BANNED;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { status: true, suspendedUntil: true },
  });
  // Lift a since-expired suspension first — otherwise re-suspending someone
  // whose old suspension already lapsed (nothing had reason to lazily
  // re-check it) gets wrongly refused as "already suspended" below.
  const currentStatus = await liftExpiredSuspension(userId, user);
  // Only a genuine downgrade (e.g. trying to "Suspend" someone already
  // banned) is refused — re-applying the same level is a deliberate,
  // explicit mod action here (extending/refreshing a suspension), not a
  // stale-report replay, so it's allowed through.
  const isDowngrade = STATUS_RANK[newStatus] < STATUS_RANK[currentStatus];
  if (isDowngrade) throw new Error(`This player is already ${currentStatus.toLowerCase()}`);

  const suspendedUntil =
    newStatus === UserStatus.SUSPENDED && options.suspensionHours != null
      ? new Date(Date.now() + options.suspensionHours * 60 * 60 * 1000)
      : null;
  const reason = options.reason?.trim().slice(0, 1000) || `Direct ${action.toLowerCase()} by mod`;
  const pointsKey = action === "SUSPEND" ? "SUSPENDED" : "BANNED";

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { status: newStatus, suspendedUntil, misconductScore: { increment: MISCONDUCT_POINTS[pointsKey] } },
    }),
    prisma.conductReport.create({
      data: {
        reporterId: modId,
        reportedUserId: userId,
        reason,
        status: ReportStatus.ACTIONED,
        actionTaken: newStatus === UserStatus.SUSPENDED ? ConductAction.SUSPENDED : ConductAction.BANNED,
        actionedById: modId,
        actionedAt: new Date(),
        actionSuspensionHours: newStatus === UserStatus.SUSPENDED ? (options.suspensionHours ?? null) : null,
      },
    }),
  ]);
}
