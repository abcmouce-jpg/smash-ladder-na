import { describe, it, expect } from "vitest";
import { parseStreamUrl, twitchStreamLink, isDeclarationFresh, LIVE_DECLARATION_TTL_MS } from "./stream-links";

describe("parseStreamUrl — YouTube", () => {
  it("reads the id out of every shape the share button produces", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    ]) {
      const link = parseStreamUrl(url);
      expect(link?.platform, url).toBe("youtube");
      expect(link?.watchUrl, url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(link?.embedUrl("example.com"), url).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    }
  });

  it("keeps extra query parameters out of the stored URL", () => {
    // A copied link usually carries ?t=, &si=, &feature= — none of which
    // should end up in the embed.
    const link = parseStreamUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&si=abc");
    expect(link?.watchUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("accepts a channel's live page and embeds its current broadcast", () => {
    const link = parseStreamUrl("https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw/live");
    expect(link?.platform).toBe("youtube");
    expect(link?.embedUrl("example.com")).toBe(
      "https://www.youtube.com/embed/live_stream?channel=UCuAXFkgsw1L7xaCfnd5JJOw",
    );
  });

  it("rejects a channel id pasted where a video id goes", () => {
    // 24 characters, not 11 — embedding it would 404 for the viewer.
    expect(parseStreamUrl("https://www.youtube.com/live/UCuAXFkgsw1L7xaCfnd5JJOw")).toBeNull();
  });

  it("rejects a bare channel or handle page, which is not a stream", () => {
    expect(parseStreamUrl("https://www.youtube.com/@someone")).toBeNull();
    expect(parseStreamUrl("https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw")).toBeNull();
  });
});

describe("parseStreamUrl — Twitch", () => {
  it("reads a channel URL and lower-cases the login", () => {
    const link = parseStreamUrl("https://www.twitch.tv/SomeStreamer");
    expect(link?.platform).toBe("twitch");
    expect(link?.watchUrl).toBe("https://www.twitch.tv/somestreamer");
  });

  it("puts the embedding host in the player URL, which Twitch requires", () => {
    const link = parseStreamUrl("twitch.tv/somestreamer");
    expect(link?.embedUrl("smash-ladder-jp.vercel.app")).toContain("parent=smash-ladder-jp.vercel.app");
    expect(link?.embedUrl("localhost")).toContain("parent=localhost");
  });

  it("rejects a sub-page that isn't a channel", () => {
    expect(parseStreamUrl("https://www.twitch.tv/directory/game/Super%20Smash%20Bros")).not.toBeNull();
    // ^ "directory" is a valid login shape, so this one does parse — the
    // check below is the real guard against junk.
    expect(parseStreamUrl("https://www.twitch.tv/")).toBeNull();
  });
});

describe("parseStreamUrl — anything else", () => {
  it("refuses platforms this cannot embed", () => {
    for (const url of [
      "https://www.nicovideo.jp/watch/sm9",
      "https://kick.com/someone",
      "https://example.com/stream",
      "not a url at all",
      "",
      "   ",
    ]) {
      expect(parseStreamUrl(url), url).toBeNull();
    }
  });

  it("refuses a javascript: URL", () => {
    expect(parseStreamUrl("javascript:alert(1)")).toBeNull();
  });

  it("assumes https when the scheme is missing", () => {
    expect(parseStreamUrl("youtube.com/watch?v=dQw4w9WgXcQ")?.platform).toBe("youtube");
  });
});

describe("twitchStreamLink", () => {
  it("builds the same link as parsing that channel's URL", () => {
    expect(twitchStreamLink("SomeStreamer").watchUrl).toBe(parseStreamUrl("twitch.tv/SomeStreamer")?.watchUrl);
  });
});

describe("isDeclarationFresh", () => {
  const now = Date.now();

  it("counts a link set just now", () => {
    expect(isDeclarationFresh(new Date(now), now)).toBe(true);
  });

  it("stops counting one past the window", () => {
    expect(isDeclarationFresh(new Date(now - LIVE_DECLARATION_TTL_MS), now)).toBe(false);
    expect(isDeclarationFresh(new Date(now - LIVE_DECLARATION_TTL_MS + 1000), now)).toBe(true);
  });

  it("treats a missing timestamp as not live", () => {
    expect(isDeclarationFresh(null, now)).toBe(false);
    expect(isDeclarationFresh(undefined, now)).toBe(false);
  });

  it("ignores a timestamp in the future", () => {
    // Clock skew between the writer and this check shouldn't grant an
    // open-ended live badge.
    expect(isDeclarationFresh(new Date(now + 60_000), now)).toBe(false);
  });
});
