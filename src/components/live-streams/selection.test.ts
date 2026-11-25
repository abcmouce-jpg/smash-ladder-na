import { describe, expect, it } from "vitest";
import { preferredStream, resolveLiveStream } from "@/components/live-streams/selection";
import { twitchStream, youtubeStream, type LiveStreamInfo } from "@/lib/stream-links";
import type { FeedPlayer, SerializedSetEntry } from "@/lib/set-entry";

// These two helpers are pure — they read the feed's live streams and the picked
// stream, nothing else — so the fixtures only need the fields they touch.
function player(id: string, streams: LiveStreamInfo[] = []): FeedPlayer {
  return { id, username: id, liveStreams: streams } as unknown as FeedPlayer;
}

const twitch = (login: string) => twitchStream(login);
const youtube = (videoId: string) => youtubeStream(videoId, `UC${videoId}`);

function entry(id: string, player1: FeedPlayer, player2: FeedPlayer): SerializedSetEntry {
  return {
    id,
    player1,
    player2,
    player1Live: player1.liveStreams.length > 0,
    player2Live: player2.liveStreams.length > 0,
    hasLiveStreamer: player1.liveStreams.length > 0 || player2.liveStreams.length > 0,
  } as unknown as SerializedSetEntry;
}

describe("preferredStream", () => {
  it("picks player 1's first stream when both sides are streaming", () => {
    const e = entry("m1", player("p1", [twitch("chan1"), youtube("v1")]), player("p2", [twitch("chan2")]));
    expect(preferredStream(e)).toEqual({ player: e.player1, stream: e.player1.liveStreams[0] });
  });

  it("picks whichever side is streaming", () => {
    const e = entry("m1", player("p1"), player("p2", [youtube("v2")]));
    expect(preferredStream(e)).toEqual({ player: e.player2, stream: e.player2.liveStreams[0] });
  });

  it("picks nobody when neither side is streaming", () => {
    expect(preferredStream(entry("m1", player("p1"), player("p2")))).toBeNull();
  });
});

describe("resolveLiveStream", () => {
  it("returns the picked side and platform while it is still streaming", () => {
    const e = entry("m1", player("p1", [twitch("chan1"), youtube("v1")]), player("p2", [twitch("chan2")]));
    const resolved = resolveLiveStream([e], { matchId: "m1", playerId: "p1", platform: "youtube" });
    expect(resolved?.player).toBe(e.player1);
    expect(resolved?.stream.platform).toBe("youtube");
  });

  // A pick made while a channel was live can outlive the stream: the 20s feed
  // poll drops that platform from the side's list but the set stays because
  // another platform is still streaming. The offline one must not keep its
  // embed up.
  it("drops a stale pick whose platform went offline", () => {
    const e = entry("m1", player("p1", [twitch("chan1")]), player("p2"));
    const resolved = resolveLiveStream([e], { matchId: "m1", playerId: "p1", platform: "youtube" });
    expect(resolved?.stream.platform).toBe("twitch");
  });

  it("ignores a pick for a side with no streams", () => {
    const e = entry("m1", player("p1"), player("p2"));
    expect(resolveLiveStream([e], { matchId: "m1", playerId: "p1", platform: "twitch" })).toBeNull();
  });

  it("falls back to the first live set when the picked set is gone", () => {
    const e = entry("m1", player("p1", [twitch("chan1")]), player("p2"));
    const resolved = resolveLiveStream([e], { matchId: "finished", playerId: "p9", platform: "twitch" });
    expect(resolved?.player).toBe(e.player1);
  });

  it("returns nothing when there are no live entries", () => {
    expect(resolveLiveStream([], { matchId: "m1", playerId: "p1", platform: "twitch" })).toBeNull();
    expect(resolveLiveStream([], null)).toBeNull();
  });
});
