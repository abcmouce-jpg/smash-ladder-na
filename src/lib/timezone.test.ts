import { describe, it, expect } from "vitest";
import { dayKeyInTimeZone, startOfDayInTimeZone } from "./timezone";

describe("dayKeyInTimeZone", () => {
  it("rolls over at UTC midnight in UTC", () => {
    expect(dayKeyInTimeZone(new Date("2026-01-01T00:00:00Z"), "UTC")).toBe("2026-01-01");
    expect(dayKeyInTimeZone(new Date("2026-01-01T23:59:59Z"), "UTC")).toBe("2026-01-01");
    expect(dayKeyInTimeZone(new Date("2026-01-02T00:00:00Z"), "UTC")).toBe("2026-01-02");
  });

  it("still shows the previous day in America/New_York just after UTC midnight (EST, UTC-5)", () => {
    expect(dayKeyInTimeZone(new Date("2026-01-01T02:00:00Z"), "America/New_York")).toBe("2025-12-31");
  });

  it("rolls over to the new day once it's actually local midnight in America/New_York", () => {
    expect(dayKeyInTimeZone(new Date("2026-01-01T05:00:00Z"), "America/New_York")).toBe("2026-01-01");
  });

  it("accounts for daylight saving (EDT, UTC-4) in summer", () => {
    // 2026-07-15T03:30Z is 2026-07-14 23:30 EDT — still the 14th locally.
    expect(dayKeyInTimeZone(new Date("2026-07-15T03:30:00Z"), "America/New_York")).toBe("2026-07-14");
    // 2026-07-15T04:30Z is 2026-07-15 00:30 EDT — now the 15th locally.
    expect(dayKeyInTimeZone(new Date("2026-07-15T04:30:00Z"), "America/New_York")).toBe("2026-07-15");
  });
});

describe("startOfDayInTimeZone", () => {
  it("returns the UTC instant of local midnight (EST, UTC-5)", () => {
    const start = startOfDayInTimeZone(new Date("2026-01-01T12:00:00Z"), "America/New_York");
    expect(start.toISOString()).toBe("2026-01-01T05:00:00.000Z");
  });

  it("returns the UTC instant of local midnight (EDT, UTC-4)", () => {
    const start = startOfDayInTimeZone(new Date("2026-07-15T12:00:00Z"), "America/New_York");
    expect(start.toISOString()).toBe("2026-07-15T04:00:00.000Z");
  });

  it("a moment right at that boundary is included, one second earlier is not", () => {
    const start = startOfDayInTimeZone(new Date("2026-01-01T12:00:00Z"), "America/New_York");
    expect(dayKeyInTimeZone(start, "America/New_York")).toBe("2026-01-01");
    expect(dayKeyInTimeZone(new Date(start.getTime() - 1000), "America/New_York")).toBe("2025-12-31");
  });
});
