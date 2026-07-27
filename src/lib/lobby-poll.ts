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
