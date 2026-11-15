import { describe, expect, it } from "vitest";
import { recentWeekIds, weekBounds, weekIdFor, weekStartFor } from "@/lib/weekly-report";
import { dayLabel } from "@/lib/week-label";

// Weeks run Monday 00:00 to Monday 00:00 in ladder time (America/New_York),
// which is 04:00 or 05:00 UTC depending on the season — so a Sunday-evening
// set in Los Angeles and a Monday-morning one in Toronto land in the weeks a
// reader would expect.
describe("week boundaries", () => {
  it("names a week by its Monday", () => {
    expect(weekIdFor(new Date("2026-11-14T16:00:00Z"))).toBe("2026-11-09"); // a Saturday
    expect(weekIdFor(new Date("2026-11-09T17:00:00Z"))).toBe("2026-11-09"); // the Monday itself
    expect(weekIdFor(new Date("2026-11-15T20:00:00Z"))).toBe("2026-11-09"); // the Sunday
  });

  it("rolls over at local midnight, not UTC midnight", () => {
    // 02:00 UTC on Monday is still 21:00 Sunday in ladder time.
    expect(weekIdFor(new Date("2026-11-16T02:00:00Z"))).toBe("2026-11-09");
    // 06:00 UTC is 01:00 Monday there.
    expect(weekIdFor(new Date("2026-11-16T06:00:00Z"))).toBe("2026-11-16");
  });

  it("spans exactly seven local days", () => {
    const bounds = weekBounds("2026-11-09");
    expect(bounds).not.toBeNull();
    expect(bounds!.start.toISOString()).toBe("2026-11-09T05:00:00.000Z");
    expect(bounds!.end.toISOString()).toBe("2026-11-16T05:00:00.000Z");
  });

  it("keeps the boundary at local midnight across the DST change", () => {
    // 2026-11-01 is the US fall-back Sunday: that week is 25 hours longer in
    // UTC terms, and both ends still sit at local midnight.
    const bounds = weekBounds("2026-10-26");
    expect(bounds!.start.toISOString()).toBe("2026-10-26T04:00:00.000Z");
    expect(bounds!.end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(bounds!.end.getTime() - bounds!.start.getTime()).toBe((7 * 24 + 1) * 60 * 60 * 1000);
  });

  it("refuses a malformed id", () => {
    expect(weekBounds("last-week")).toBeNull();
    expect(weekBounds("2026-11-9")).toBeNull();
  });

  it("walks backwards a week at a time, newest first", () => {
    const ids = recentWeekIds(4, new Date("2026-11-14T16:00:00Z"));
    expect(ids).toEqual(["2026-11-09", "2026-11-02", "2026-10-26", "2026-10-19"]);
  });

  it("is idempotent — the start of a week is its own week", () => {
    const start = weekStartFor(new Date("2026-11-14T16:00:00Z"));
    expect(weekStartFor(start).toISOString()).toBe(start.toISOString());
  });
});

describe("day labels", () => {
  it("puts the weekday first, the way a reader writes it", () => {
    expect(dayLabel("2026-11-09", "en")).toBe("Mon 9");
    expect(dayLabel("2026-11-15", "en")).toBe("Sun 15");
  });
});
