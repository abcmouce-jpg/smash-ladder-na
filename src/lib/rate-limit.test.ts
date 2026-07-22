import { describe, it, expect } from "vitest";
import { enforceRateLimit, minutesAgo } from "./rate-limit";

describe("enforceRateLimit", () => {
  it("does nothing when count is under the limit", async () => {
    await expect(
      enforceRateLimit({ count: async () => 0, limit: 5, windowLabel: "5 minutes" }),
    ).resolves.toBeUndefined();
  });

  it("throws when count meets the limit", async () => {
    await expect(
      enforceRateLimit({ count: async () => 5, limit: 5, windowLabel: "5 minutes" }),
    ).rejects.toThrow("Too many requests");
  });

  it("throws when count exceeds the limit", async () => {
    await expect(
      enforceRateLimit({ count: async () => 10, limit: 5, windowLabel: "5 minutes" }),
    ).rejects.toThrow("Too many requests");
  });

  it("includes the limit and window in the error message", async () => {
    await expect(
      enforceRateLimit({ count: async () => 3, limit: 3, windowLabel: "1 hour" }),
    ).rejects.toThrow("3 per 1 hour");
  });
});

describe("minutesAgo", () => {
  it("returns a Date in the past", () => {
    const now = Date.now();
    const result = minutesAgo(5);
    const diff = now - result.getTime();
    // Should be approximately 5 minutes (300_000ms), with some tolerance
    expect(diff).toBeGreaterThanOrEqual(299_000);
    expect(diff).toBeLessThanOrEqual(301_000);
  });

  it("returns roughly now for 0 minutes", () => {
    const now = Date.now();
    const result = minutesAgo(0);
    expect(Math.abs(now - result.getTime())).toBeLessThan(100);
  });
});
