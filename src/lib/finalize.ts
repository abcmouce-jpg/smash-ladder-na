import { prisma } from "@/lib/db";
import { LobbyEntryStatus, MatchStatus, PostStatus } from "@/generated/prisma/enums";
import { autoConfirmStaleGameReport } from "@/lib/match-games";

export async function finalizeExpiredLobbyEntries(now = new Date()) {
  const result = await prisma.ratingLobbyEntry.updateMany({
    where: { status: LobbyEntryStatus.WAITING, expiresAt: { lt: now } },
    data: { status: LobbyEntryStatus.EXPIRED },
  });
  return result.count;
}

export async function finalizeExpiredMatches(now = new Date()) {
  const overdue = await prisma.ratingMatch.findMany({
    where: { status: MatchStatus.PENDING_REPORT, expiresAt: { lt: now } },
    select: { id: true, player1Id: true, player2Id: true },
  });

  // Reporting is per-game (BO3), not per-match, so "timed out" is decided
  // per match by whether its current game has a lone unconfirmed report —
  // that side did their part, so their report is accepted and the other
  // side is charged a no-show. A match with no hanging report (nobody
  // reported anything, or the current game isn't even decided yet) just
  // expires below with no rating impact for either player.
  let autoConfirmed = 0;
  const handledIds: string[] = [];
  for (const match of overdue) {
    const result = await autoConfirmStaleGameReport(match, now);
    if (result) {
      autoConfirmed++;
      handledIds.push(match.id);
    }
  }

  const expiredNoReport = await prisma.ratingMatch.updateMany({
    where: {
      status: MatchStatus.PENDING_REPORT,
      expiresAt: { lt: now },
      id: { notIn: handledIds },
    },
    data: { status: MatchStatus.EXPIRED },
  });

  return { expiredNoReport: expiredNoReport.count, autoConfirmed };
}

export async function finalizeExpiredFreeBattlePosts(now = new Date()) {
  const result = await prisma.freeBattlePost.updateMany({
    where: { status: PostStatus.OPEN, expiresAt: { lt: now } },
    data: { status: PostStatus.EXPIRED },
  });
  return result.count;
}
