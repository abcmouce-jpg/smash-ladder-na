import { describe, expect, it } from "vitest";
import { preferredStreamer, resolveLiveStream } from "@/components/live-streams/selection";
import type { FeedPlayer, SerializedSetEntry } from "@/lib/set-entry";

// These two helpers are pure — they read the feed's live flags and the picked
// side, nothing else — so the fixtures only need the fields they touch.
function player(id: string, twitchUsername: string | null): FeedPlayer {
  return { id, username: id, twitchUsername } as unknown as FeedPlayer;
}

function entry(
  id: string,
  player1: FeedPlayer,
  player2: FeedPlayer,
  live: { player1: boolean; player2: boolean },
): SerializedSetEntry {
  return {
    id,
    player1,
    player2,
    player1Live: live.player1,
    player2Live: live.player2,
    hasLiveStreamer: live.player1 || live.player2,
  } as unknown as SerializedSetEntry;
}

describe("preferredStreamer", () => {
  it("picks player 1 when both sides are streaming", () => {
    const e = entry("m1", player("p1", "chan1"), player("p2", "chan2"), { player1: true, player2: true });
    expect(preferredStreamer(e)).toBe(e.player1);
  });

  it("picks whichever side is streaming", () => {
    const e = entry("m1", player("p1", "chan1"), player("p2", "chan2"), { player1: false, player2: true });
    expect(preferredStreamer(e)).toBe(e.player2);
  });

  it("picks nobody when neither side is streaming", () => {
    const e = entry("m1", player("p1", "chan1"), player("p2", "chan2"), { player1: false, player2: false });
    expect(preferredStreamer(e)).toBeNull();
  });
});

describe("resolveLiveStream", () => {
  it("returns the picked side while it is still streaming", () => {
    const e = entry("m1", player("p1", "chan1"), player("p2", "chan2"), { player1: true, player2: true });
    expect(resolveLiveStream([e], { matchId: "m1", playerId: "p2" })).toEqual({ entry: e, player: e.player2 });
  });

  // A pick made while a channel was live can outlive the stream: the 20s feed
  // poll drops that side's live flag but the set stays in the list because the
  // OTHER side is still streaming. The offline side must not keep its embed up.
  it("drops a stale pick whose channel went offline", () => {
    const e = entry("m1", player("p1", "chan1"), player("p2", "chan2"), { player1: false, player2: true });
    expect(resolveLiveStream([e], { matchId: "m1", playerId: "p1" })).toEqual({ entry: e, player: e.player2 });
  });

  it("ignores a pick for a side with no Twitch channel", () => {
    const e = entry("m1", player("p1", null), player("p2", null), { player1: false, player2: false });
    expect(resolveLiveStream([e], { matchId: "m1", playerId: "p1" })).toBeNull();
  });

  it("falls back to the first live set when the picked set is gone", () => {
    const e = entry("m1", player("p1", "chan1"), player("p2", "chan2"), { player1: true, player2: false });
    expect(resolveLiveStream([e], { matchId: "finished", playerId: "p9" })).toEqual({ entry: e, player: e.player1 });
  });

  it("returns nothing when there are no live entries", () => {
    expect(resolveLiveStream([], { matchId: "m1", playerId: "p1" })).toBeNull();
    expect(resolveLiveStream([], null)).toBeNull();
  });
});
