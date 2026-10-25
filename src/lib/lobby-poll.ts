// Whether the lobby page's client-side poller (LobbyPoller) should keep
// refreshing. Covers three windows: waiting in the queue, an active
// in-progress match, and — since chat stays open after a set ends until
// the viewer clicks Leave — the post-set chat window too. Missing that
// last case was a real bug: without it, an opponent's incoming chat
// message (and a pending rematch request/acceptance) would only ever
// surface on this player's own next self-triggered action instead of
// within a few seconds.
export function shouldPollLobby({
  isInActiveMatch,
  isWaiting,
  matchJustEnded,
  hasLeftMatch,
}: {
  isInActiveMatch: boolean;
  isWaiting: boolean;
  matchJustEnded: boolean;
  hasLeftMatch: boolean;
}): boolean {
  return isInActiveMatch || isWaiting || (matchJustEnded && !hasLeftMatch);
}

// ---------------------------------------------------------------------------
// How often that poller is allowed to refresh, as opposed to whether it runs
// at all (shouldPollLobby above).
//
// Every tick is a router.refresh(), which re-runs the whole /lobby route on
// the server. Measured 2026-10-20: /lobby alone was 1,485,283 function
// invocations in seven days — half of every invocation the site makes — and
// Observability Events, billed per event rather than per CPU-second, was the
// largest line on the Vercel bill at $54.53 for twenty days. Those events
// scale with how *many* requests there are, so making each render cheaper
// would not touch them; only refreshing less does.
//
// The expensive case is a player waiting in queue with the tab backgrounded.
// That case exists for a good reason (see LobbyPoller's keepPollingInBackground
// note: matches were auto-forfeited because a backgrounded tab had stopped
// polling and the player never heard the cue), so the cadence is unchanged for
// anyone who depends on it. It is relaxed only when the server has another way
// to reach the player: joinLobbyAndTryPair fires notifyMatchFoundToUsers — a
// Web Push — the moment a pairing happens (lib/lobby.ts), and a push wakes a
// backgrounded tab without any polling. For those players the poll is a
// fallback, and a fallback need not run every five seconds.

export const POLL_INTERVAL_MS = 5000;

// Used only while hidden *and* push-subscribed. Kept well inside
// STRIKE_TIMEOUT_MS (60s, lib/match-games.ts) so that even if the push is
// dropped entirely the fallback still surfaces the match with most of the
// striking window left. 30s was the first choice and is exactly half of it,
// which is not "well inside" anything — 20s leaves 40s to strike in and still
// cuts these refreshes by four fifths.
export const BACKGROUND_PUSH_INTERVAL_MS = 20_000;

export type PollDecisionInput = {
  /** document.visibilityState === "visible" */
  visible: boolean;
  /** LobbyPoller's keepPollingInBackground — true while waiting in queue. */
  keepPollingInBackground: boolean;
  /** The player has at least one live Web Push subscription. */
  hasPushSubscription: boolean;
  /** Milliseconds since the last refresh this poller actually performed. */
  msSinceLastRefresh: number;
};

/**
 * Whether this tick should call router.refresh().
 *
 * Visible tabs are unchanged: every tick refreshes. Hidden tabs that are not
 * waiting are unchanged too: they never refresh. The only new behaviour is a
 * hidden tab that *is* waiting and *is* push-subscribed, which drops to
 * BACKGROUND_PUSH_INTERVAL_MS.
 */
export function shouldRefresh({
  visible,
  keepPollingInBackground,
  hasPushSubscription,
  msSinceLastRefresh,
}: PollDecisionInput): boolean {
  if (visible) return true;
  if (!keepPollingInBackground) return false;
  if (!hasPushSubscription) return true;
  return msSinceLastRefresh >= BACKGROUND_PUSH_INTERVAL_MS;
}
