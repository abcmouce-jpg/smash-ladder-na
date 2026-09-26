import Link from "next/link";
import { headers } from "next/headers";
import { Clock, Swords } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { LobbyEntryStatus, MatchStatus } from "@/generated/prisma/enums";
import { QueueTimer } from "@/components/queue-timer";
import { QueueStatusPoller } from "@/components/queue-status-poller";
import { touchWaitingLobbyEntry } from "@/lib/lobby";

// The Lobby page shows both of these states in full — a queue wait with a live
// timer, and the whole match panel — but only to someone looking at that page.
// A player who queues and then wanders off elsewhere (the normal thing to do
// while waiting) had nothing anywhere else telling them they were still
// inline, or that they'd just been paired. Same site-wide strip as
// RegionSetupBanner, covering the two states that matter:
//
//   - WAITING on an unexpired entry: how long they've been in the queue.
//   - an unresolved (PENDING_REPORT/REPORTED/DISPUTED) match: paired, needs them.
//     DISPUTED counts as still live — the Lobby page treats a match-level
//     dispute as in-progress too (see isInActiveMatch there), so omitting it
//     made this strip vanish mid-match while the players were waiting on a mod.
//
// Deliberately a lean read of just the columns it needs rather than
// getActiveLobbyEntry: this renders on every page for every signed-in user,
// and that function's matchWithPlayers join plus getMatchGames' lazy
// auto-forfeit resolvers are more work than a status strip should trigger.
// The Lobby page still owns the authoritative view; this only needs to know
// which of the two states applies.
export async function QueueStatusBanner() {
  // Nothing to show on the Lobby page itself: it already puts the queue wait
  // and the full match panel right in front of the player, so a thinner copy
  // up top would just be noise. Checked before any auth/DB work (and before
  // the poller mounts below) so /lobby pays nothing for this.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname.startsWith("/lobby")) return null;

  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const [match, waiting] = await Promise.all([
    prisma.ratingMatch.findFirst({
      where: {
        OR: [{ player1Id: userId }, { player2Id: userId }],
        status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED, MatchStatus.DISPUTED] },
      },
      orderBy: { createdAt: "desc" },
      select: { player1Id: true, player1LeftAt: true, player2LeftAt: true },
    }),
    prisma.ratingLobbyEntry.findFirst({
      where: { userId, status: LobbyEntryStatus.WAITING, expiresAt: { gt: new Date() } },
      orderBy: { joinedAt: "desc" },
      select: { joinedAt: true },
    }),
  ]);

  // Mirror the Lobby page's own "left the match" check: once a player clicks
  // Leave, its match panel is hidden even while the match is still
  // unresolved, so don't point the banner at one they've walked away from.
  const leftMatch = match ? (match.player1Id === userId ? match.player1LeftAt : match.player2LeftAt) !== null : false;
  const inMatch = Boolean(match) && !leftMatch;
  if (!inMatch && !waiting) return null;

  // Being on any page counts as presence for the queue's idle window (see
  // LOBBY_ENTRY_TTL_MS): this strip re-renders on the same ~5s poll as the
  // lobby, so a player who queued and wandered off elsewhere keeps their spot
  // instead of lapsing for not sitting on /lobby. No-op unless they're actually
  // waiting, so the common case still costs nothing.
  if (waiting) await touchWaitingLobbyEntry(userId);

  return (
    <div className="border-b border-border bg-primary/5">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-2 text-sm">
        {inMatch ? (
          <>
            <Swords className="size-3.5 shrink-0 text-primary" />
            <span className="text-muted-foreground">You&apos;re in a match —</span>
            <Link href="/lobby" className="font-medium text-primary hover:underline">
              go to Lobby
            </Link>
          </>
        ) : waiting ? (
          <>
            <Clock className="size-3.5 shrink-0 text-primary" />
            <span className="text-muted-foreground">In queue</span>
            <span className="font-medium tabular-nums text-foreground">
              <QueueTimer joinedAt={waiting.joinedAt.toISOString()} />
            </span>
            <span className="text-muted-foreground">—</span>
            <Link href="/lobby" className="font-medium text-primary hover:underline">
              go to Lobby
            </Link>
          </>
        ) : null}
        <QueueStatusPoller />
      </div>
    </div>
  );
}
