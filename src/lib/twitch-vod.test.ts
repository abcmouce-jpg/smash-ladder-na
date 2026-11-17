import { describe, expect, it } from "vitest";
import {
  findCoveringVideo,
  formatTwitchTime,
  isVideoStillOpen,
  parseTwitchDuration,
  twitchVideoUrl,
  type TwitchVideo,
} from "@/lib/twitch-vod";

function video(overrides: Partial<TwitchVideo> & { createdAt: Date; durationSeconds: number }): TwitchVideo {
  return {
    id: "v1",
    userId: "42",
    userLogin: "streamer",
    url: "https://www.twitch.tv/videos/v1",
    ...overrides,
  };
}

describe("parseTwitchDuration", () => {
  it("parses hours, minutes, and seconds together", () => {
    expect(parseTwitchDuration("1h2m3s")).toBe(3723);
  });

  it("parses a lone unit", () => {
    expect(parseTwitchDuration("2h")).toBe(7200);
    expect(parseTwitchDuration("45m")).toBe(2700);
    expect(parseTwitchDuration("30s")).toBe(30);
  });

  it("treats an empty or unparseable duration as zero", () => {
    expect(parseTwitchDuration("")).toBe(0);
    expect(parseTwitchDuration("nope")).toBe(0);
  });
});

describe("formatTwitchTime", () => {
  it("formats seconds as Twitch's 1h2m3s offset string", () => {
    expect(formatTwitchTime(3723)).toBe("1h2m3s");
    expect(formatTwitchTime(600)).toBe("0h10m0s");
    expect(formatTwitchTime(0)).toBe("0h0m0s");
  });

  it("clamps negative input to zero", () => {
    expect(formatTwitchTime(-5)).toBe("0h0m0s");
  });
});

describe("twitchVideoUrl", () => {
  it("opens the VOD at the set's start", () => {
    expect(twitchVideoUrl("123", 3723)).toBe("https://www.twitch.tv/videos/123?t=1h2m3s");
  });

  it("omits the timestamp when there is no offset", () => {
    expect(twitchVideoUrl("123", 0)).toBe("https://www.twitch.tv/videos/123");
    expect(twitchVideoUrl("123", null)).toBe("https://www.twitch.tv/videos/123");
  });
});

describe("findCoveringVideo", () => {
  const streamStart = new Date("2026-01-01T20:00:00.000Z");

  it("picks a VOD whose window contains the set's end", () => {
    const vods = [video({ id: "vod-1", createdAt: streamStart, durationSeconds: 3600 })];
    // Set ran 20:10 → 20:30, well inside the 20:00–21:00 VOD.
    const result = findCoveringVideo(
      vods,
      new Date("2026-01-01T20:10:00.000Z"),
      new Date("2026-01-01T20:30:00.000Z"),
    );
    expect(result?.video.id).toBe("vod-1");
    // 10 minutes into the stream.
    expect(result?.offsetSeconds).toBe(600);
  });

  it("returns null when no VOD covers the set", () => {
    // VOD ended at 20:30; the set finished at 21:00 — long past it.
    const vods = [video({ createdAt: streamStart, durationSeconds: 1800 })];
    expect(
      findCoveringVideo(vods, new Date("2026-01-01T20:40:00.000Z"), new Date("2026-01-01T21:00:00.000Z")),
    ).toBeNull();
  });

  it("clamps the offset to 0 when the set began before the stream did", () => {
    const vods = [video({ id: "vod-2", createdAt: streamStart, durationSeconds: 3600 })];
    const result = findCoveringVideo(
      vods,
      new Date("2026-01-01T19:50:00.000Z"), // before the VOD starts
      new Date("2026-01-01T20:15:00.000Z"),
    );
    expect(result?.offsetSeconds).toBe(0);
  });

  it("picks the covering VOD out of several, ignoring the ones that miss", () => {
    const vods = [
      video({ id: "old", createdAt: new Date("2026-01-01T18:00:00.000Z"), durationSeconds: 3600 }),
      video({ id: "new", createdAt: new Date("2026-01-01T20:00:00.000Z"), durationSeconds: 3600 }),
    ];
    const result = findCoveringVideo(
      vods,
      new Date("2026-01-01T20:20:00.000Z"),
      new Date("2026-01-01T20:40:00.000Z"),
    );
    expect(result?.video.id).toBe("new");
    expect(result?.offsetSeconds).toBe(1200);
  });

  it("still counts a set ending just past the VOD as covered, within clock slack", () => {
    const vods = [video({ id: "vod-3", createdAt: streamStart, durationSeconds: 1800 })];
    // VOD ends 20:30; set ends 20:32 — inside the 5-minute slack.
    const result = findCoveringVideo(
      vods,
      new Date("2026-01-01T20:20:00.000Z"),
      new Date("2026-01-01T20:32:00.000Z"),
    );
    expect(result?.video.id).toBe("vod-3");
  });

  it("returns null for an empty VOD list", () => {
    expect(findCoveringVideo([], new Date("2026-01-01T20:00:00.000Z"), new Date("2026-01-01T20:30:00.000Z"))).toBeNull();
  });

  it("does not match a VOD that started after the set ended", () => {
    // A later stream's broadcast (starts 22:00) must not be reported as the VOD
    // for a set that finished at 21:55 — the five-minute end-of-window slack is
    // deliberately not applied to the VOD's start.
    const vods = [video({ id: "later", createdAt: new Date("2026-01-01T22:00:00.000Z"), durationSeconds: 3600 })];
    expect(
      findCoveringVideo(vods, new Date("2026-01-01T21:50:00.000Z"), new Date("2026-01-01T21:55:00.000Z")),
    ).toBeNull();
  });

  it("still matches when the set's end lands just before the VOD's start", () => {
    // 30 seconds of clock skew at the boundary, not a different broadcast.
    const vods = [video({ id: "boundary", createdAt: new Date("2026-01-01T20:00:30.000Z"), durationSeconds: 3600 })];
    const result = findCoveringVideo(
      vods,
      new Date("2026-01-01T19:58:00.000Z"),
      new Date("2026-01-01T20:00:00.000Z"),
    );
    expect(result?.video.id).toBe("boundary");
    expect(result?.offsetSeconds).toBe(0);
  });
});

describe("isVideoStillOpen", () => {
  const now = new Date("2026-01-01T21:00:00.000Z").getTime();

  it("is true while the recorded window reaches now (the live broadcast)", () => {
    // Started 20:00, reported duration 60m -> ends 21:00, still running.
    expect(
      isVideoStillOpen(
        video({ createdAt: new Date("2026-01-01T20:00:00.000Z"), durationSeconds: 3600 }),
        now,
      ),
    ).toBe(true);
  });

  it("is false once the window ended before now", () => {
    expect(
      isVideoStillOpen(
        video({ createdAt: new Date("2026-01-01T20:00:00.000Z"), durationSeconds: 600 }),
        now,
      ),
    ).toBe(false);
  });

  it("stays open through the clock slack after the recorded end", () => {
    // Ends 20:58; still treated as open two minutes later at 21:00.
    expect(
      isVideoStillOpen(
        video({ createdAt: new Date("2026-01-01T20:00:00.000Z"), durationSeconds: 3480 }),
        now,
      ),
    ).toBe(true);
  });
});
