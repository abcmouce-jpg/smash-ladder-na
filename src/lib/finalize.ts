import { prisma } from "@/lib/db";
import { LobbyEntryStatus, MatchStatus, ConfirmationMethod, PostStatus } from "@/generated/prisma/enums";
import { applyEloAndConfirm } from "@/lib/matches";

export async function finalizeExpiredLobbyEntries(now = new Date()) {
  const result = await prisma.ratingLobbyEntry.updateMany({
    where: { status: LobbyEntryStatus.WAITING, expiresAt: { lt: now } },
    data: { status: LobbyEntryStatus.EXPIRED },
  });
  return result.count;
}

export async function finalizeExpiredMatches(now = new Date()) {
  // Nobody reported before the deadline: no rating impact, just close it out.
  const expiredNoReport = await prisma.ratingMatch.updateMany({
    where: { status: MatchStatus.PENDING_REPORT, expiresAt: { lt: now } },
    data: { status: MatchStatus.EXPIRED },
  });

  // One player reported and the other never responded: accept the lone
  // report as the result once the deadline passes.
  const timedOut = await prisma.ratingMatch.findMany({
    where: { status: MatchStatus.REPORTED, expiresAt: { lt: now } },
    select: { id: true, player1Id: true, player2Id: true, reportedWinnerId: true, reportedById: true },
  });

  let autoConfirmed = 0;
  for (const match of timedOut) {
    if (!match.reportedWinnerId || !match.reportedById) continue;
    // Only the side that never responded is charged a no-show — the reporter
    // showed up and did their part. (A PENDING_REPORT expiry above has no
    // such signal: neither player reported, so blame isn't attributable.)
    const nonReporterId =
      match.reportedById === match.player1Id ? match.player2Id : match.player1Id;
    await prisma.$transaction(async (tx) => {
      await applyEloAndConfirm(tx, match, match.reportedWinnerId!, ConfirmationMethod.AUTO_TIMEOUT, null);
      await tx.user.update({
        where: { id: nonReporterId },
        data: { noShowCount: { increment: 1 } },
      });
    });
    autoConfirmed++;
  }

  return { expiredNoReport: expiredNoReport.count, autoConfirmed };
}

export async function finalizeExpiredFreeBattlePosts(now = new Date()) {
  const result = await prisma.freeBattlePost.updateMany({
    where: { status: PostStatus.OPEN, expiresAt: { lt: now } },
    data: { status: PostStatus.EXPIRED },
  });
  return result.count;
}
