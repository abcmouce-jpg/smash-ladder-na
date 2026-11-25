import { describe, it, expect } from "vitest";
import {
  liveStreamEmbedUrl,
  liveStreamWatchUrl,
  streamVodEmbedUrl,
  streamVodWatchUrl,
  twitchParent,
  twitchStream,
  youtubeStream,
  youtubeVideoUrl,
} from "./stream-links";

describe("twitchParent", () => {
  it("drops the dev server's port, which Twitch rejects as InvalidCharInParent", () => {
    expect(twitchParent("localhost:3000")).toBe("localhost");
    expect(twitchParent("127.0.0.1:3000")).toBe("localhost");
    expect(twitchParent("smash-ladder-na.vercel.app:443")).toBe("smash-ladder-na.vercel.app");
  });

  it("reports loopback as localhost, the one dev hostname Twitch accepts", () => {
    expect(twitchParent("127.0.0.1")).toBe("localhost");
    expect(twitchParent("[::1]:3000")).toBe("localhost");
  });

  it("strips a full origin down to a bare hostname", () => {
    expect(twitchParent("https://example.com/path?q=1")).toBe("example.com");
  });
});

describe("twitch streams", () => {
  it("lower-cases the login and builds watch/embed URLs", () => {
    const stream = twitchStream("SomeStreamer");
    expect(liveStreamWatchUrl(stream)).toBe("https://www.twitch.tv/somestreamer");
    expect(liveStreamEmbedUrl(stream, "smash-ladder-jp.vercel.app")).toContain("parent=smash-ladder-jp.vercel.app");
    expect(liveStreamEmbedUrl(stream, "localhost:3000")).toContain("parent=localhost");
  });

  it("falls back to the login when there is no display name", () => {
    expect(twitchStream("SomeStreamer").displayName).toBe("somestreamer");
  });
});

describe("youtube streams", () => {
  it("builds the video watch/embed URLs", () => {
    const stream = youtubeStream("dQw4w9WgXcQ", "UCabc", "My Channel");
    expect(stream.displayName).toBe("My Channel");
    expect(liveStreamWatchUrl(stream)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(liveStreamEmbedUrl(stream, "example.com")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });
});

describe("streamVod", () => {
  it("builds a Twitch VOD URL with the 1h2m3s offset", () => {
    expect(streamVodWatchUrl("twitch", "123", 3723)).toBe("https://www.twitch.tv/videos/123?t=1h2m3s");
    expect(streamVodWatchUrl("twitch", "123", null)).toBe("https://www.twitch.tv/videos/123");
    expect(streamVodEmbedUrl("twitch", "123", 3723, "localhost")).toContain("video=v123");
    expect(streamVodEmbedUrl("twitch", "123", 3723, "localhost")).toContain("time=1h2m3s");
  });

  it("builds a YouTube VOD URL with a whole-second start", () => {
    expect(youtubeVideoUrl("dQw4w9WgXcQ", 3723)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3723s");
    expect(youtubeVideoUrl("dQw4w9WgXcQ", 0)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(streamVodEmbedUrl("youtube", "dQw4w9WgXcQ", 3723, "localhost")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&start=3723",
    );
  });
});
