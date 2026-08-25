import { prisma } from "@/lib/db";
import { ReportStatus, UserStatus } from "@/generated/prisma/enums";
import {
  CANCEL_SUSPEND_DURATION_HOURS,
  CANCEL_SUSPEND_MIN_CANCELS,
  CANCEL_WARNING_MIN_CANCELS,
  isCancelSuspendThreshold,
  isCancelWarningThreshold,
} from "@/lib/account";
import { sendDiscordDM } from "@/lib/discord-bot";

export type WatchlistPlayer = {
  id: string;
  username: string;
  cancelCount: number;
  gamesPlayed: number;
  noShowCount: number;
  misconductScore: number;
  openReportCount: number;
};

// Surfaces players the site's own cancel-abuse thresholds (see account.ts)
// already consider suspend/warning-worthy, but who nothing else displays —
// cancelMatch only auto-suspends AT the moment a qualifying cancel happens,
// so someone whose 24h auto-suspend already lapsed (see
// CANCEL_SUSPEND_DURATION_HOURS) and kept playing/cancelling afterward just
// sits there ACTIVE with no queue surfacing them again until their next
// cancel re-triggers the check. This page is that missing "look again"
// pass, run on demand instead of only reactively.
export async function getSuspendWatchlist(): Promise<{
  suspendThreshold: WatchlistPlayer[];
  warningThreshold: WatchlistPlayer[];
}> {
  const candidates = await prisma.user.findMany({
    where: { status: UserStatus.ACTIVE, cancelCount: { gte: CANCEL_WARNING_MIN_CANCELS } },
    select: {
      id: true,
      username: true,
      cancelCount: true,
      gamesPlayed: true,
      noShowCount: true,
      misconductScore: true,
      _count: { select: { reportsReceived: { where: { status: ReportStatus.OPEN } } } },
    },
    orderBy: { cancelCount: "desc" },
  });

  const suspendThreshold: WatchlistPlayer[] = [];
  const warningThreshold: WatchlistPlayer[] = [];

  for (const c of candidates) {
    // Below CANCEL_SUSPEND_MIN_CANCELS, isCancelSuspendThreshold can never
    // fire — the query's gte filter above only guarantees the (lower)
    // warning minimum, so anyone under the suspend minimum needs the
    // warning check regardless of their ratio.
    const player: WatchlistPlayer = {
      id: c.id,
      username: c.username,
      cancelCount: c.cancelCount,
      gamesPlayed: c.gamesPlayed,
      noShowCount: c.noShowCount,
      misconductScore: c.misconductScore,
      openReportCount: c._count.reportsReceived,
    };
    if (c.cancelCount >= CANCEL_SUSPEND_MIN_CANCELS && isCancelSuspendThreshold(c.cancelCount, c.gamesPlayed)) {
      suspendThreshold.push(player);
    } else if (isCancelWarningThreshold(c.cancelCount, c.gamesPlayed)) {
      warningThreshold.push(player);
    }
  }

  return { suspendThreshold, warningThreshold };
}

// The cron-driven version of clicking "Suspend" on every row in the
// suspendThreshold list — same status/suspendedUntil/DM as cancelMatch's
// live auto-suspend (see matches.ts), just re-run on a schedule instead of
// only at the moment a qualifying cancel happens. getSuspendWatchlist's
// `status: ACTIVE` filter already keeps this idempotent: once suspended, a
// player drops out of the candidate list until the suspension lifts, so
// re-running this doesn't re-suspend anyone already caught.
export async function autoSuspendWatchlistViolators() {
  const { suspendThreshold } = await getSuspendWatchlist();
  const suspendedUsernames: string[] = [];

  for (const player of suspendThreshold) {
    const user = await prisma.user.update({
      where: { id: player.id },
      data: {
        status: UserStatus.SUSPENDED,
        suspendedUntil: new Date(Date.now() + CANCEL_SUSPEND_DURATION_HOURS * 60 * 60 * 1000),
      },
      select: { discordId: true, username: true, cancelCount: true },
    });
    await sendDiscordDM(
      user.discordId,
      `🚫 Your account has been suspended for ${CANCEL_SUSPEND_DURATION_HOURS} hours — an automated patrol found your cancel count (${user.cancelCount}) still crosses the threshold for a cancel-abuse pattern. Free battle and filing new conduct reports are unavailable until it lifts; ranked play still works. If you think this is a mistake, contact a mod.`,
    );
    suspendedUsernames.push(user.username);
  }

  return suspendedUsernames;
}
