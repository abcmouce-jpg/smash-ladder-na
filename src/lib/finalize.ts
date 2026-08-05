import { prisma } from "@/lib/db";
import { LobbyEntryStatus, MatchStatus, PostStatus, UserRole } from "@/generated/prisma/enums";
import { autoConfirmStaleGameReport, closeOutUnansweredLead } from "@/lib/match-games";
import { sendDiscordDM } from "@/lib/discord-bot";

export async function finalizeExpiredLobbyEntries(now = new Date()) {
  const result = await prisma.ratingLobbyEntry.updateMany({
    where: { status: LobbyEntryStatus.WAITING, expiresAt: { lt: now } },
    data: { status: LobbyEntryStatus.EXPIRED },
  });
  return result.count;
}

// So mods have visibility into abandoned sets without checking /admin/live
// every morning — added after a batch of matches sat all night with nobody
// reporting, going unnoticed until players started messaging directly.
async function alertModsOfAbandonedMatch(message: string) {
  const mods = await prisma.user.findMany({
    where: { role: { in: [UserRole.MOD, UserRole.ADMIN] } },
    select: { discordId: true },
  });
  await Promise.all(mods.map((mod) => sendDiscordDM(mod.discordId, message)));
}

export async function finalizeExpiredMatches(now = new Date()) {
  const overdue = await prisma.ratingMatch.findMany({
    where: { status: MatchStatus.PENDING_REPORT, expiresAt: { lt: now } },
    select: {
      id: true,
      player1Id: true,
      player2Id: true,
      player1: { select: { username: true } },
      player2: { select: { username: true } },
    },
  });

  // Reporting is per-game (BO3), not per-match, so "timed out" is decided
  // per match by whether its current game has a lone unconfirmed report —
  // that side did their part, so their report is accepted and the other
  // side is charged a no-show. Failing that, a side already ahead with the
  // other at zero wins (see closeOutUnansweredLead) gets the set outright —
  // covers the case where the trailing player vanished before any further
  // game got far enough to even have a report to accept. A match with
  // neither (nobody reported anything and no one-sided lead) just expires
  // below with no rating impact for either player.
  let autoConfirmed = 0;
  let closedOutOnLead = 0;
  const handledIds = new Set<string>();
  for (const match of overdue) {
    const result = await autoConfirmStaleGameReport(match, now);
    if (result) {
      autoConfirmed++;
      handledIds.add(match.id);

      const reporterName = result.reporterId === match.player1Id ? match.player1.username : match.player2.username;
      const nonReporterName =
        result.nonReporterId === match.player1Id ? match.player1.username : match.player2.username;
      await alertModsOfAbandonedMatch(
        `⏱️ Auto-confirmed: ${match.player1.username} vs ${match.player2.username}, game ${result.gameNumber} — ${reporterName}'s report was accepted after ${nonReporterName} didn't respond in time.`,
      );
      continue;
    }

    const leadResult = await closeOutUnansweredLead(match, now);
    if (leadResult) {
      closedOutOnLead++;
      handledIds.add(match.id);

      const winnerName = leadResult.winnerId === match.player1Id ? match.player1.username : match.player2.username;
      const loserName = leadResult.loserId === match.player1Id ? match.player1.username : match.player2.username;
      await alertModsOfAbandonedMatch(
        `⏱️ Auto-confirmed: ${match.player1.username} vs ${match.player2.username} — ${winnerName} was already ahead with zero response from ${loserName}, so the set was awarded to them once the match expired.`,
      );
    }
  }

  // Claim each expiry individually (guarded on still being PENDING_REPORT)
  // before notifying, rather than notifying off the pre-write snapshot —
  // otherwise two overlapping cron runs both see the same match in
  // stillUnhandled and both DM mods about it. Only the run that actually
  // wins the status flip gets to alert.
  const stillUnhandled = overdue.filter((m) => !handledIds.has(m.id));
  let expiredNoReport = 0;
  for (const m of stillUnhandled) {
    const claim = await prisma.ratingMatch.updateMany({
      where: { id: m.id, status: MatchStatus.PENDING_REPORT, expiresAt: { lt: now } },
      data: { status: MatchStatus.EXPIRED },
    });
    if (claim.count === 0) continue;

    expiredNoReport++;
    await alertModsOfAbandonedMatch(
      `🚫 Expired with no report: ${m.player1.username} vs ${m.player2.username} — closed with no rating impact for either side. Force-confirm from /admin/live if you know who actually won.`,
    );
  }

  return { expiredNoReport, autoConfirmed, closedOutOnLead };
}

export async function finalizeExpiredFreeBattlePosts(now = new Date()) {
  const result = await prisma.freeBattlePost.updateMany({
    where: { status: PostStatus.OPEN, expiresAt: { lt: now } },
    data: { status: PostStatus.EXPIRED },
  });
  return result.count;
}
