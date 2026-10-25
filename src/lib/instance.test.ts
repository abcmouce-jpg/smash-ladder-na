import { describe, it, expect, vi, afterEach } from "vitest";

// Every flag in lib/site.ts is read once at module load, so each instance has
// to be loaded under its own stubbed environment.
async function load(regionSet?: "jp") {
  vi.resetModules();
  if (regionSet) vi.stubEnv("NEXT_PUBLIC_REGION_SET", regionSet);
  return {
    site: await import("./site"),
    regions: await import("./regions"),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the Japanese instance's launch rules", () => {
  it("does not match on distance", async () => {
    const { site } = await load("jp");
    expect(site.DISTANCE_MATCHMAKING).toBe(false);
  });

  it("does not allow low-latency mods", async () => {
    const { site } = await load("jp");
    expect(site.ALLOWS_LATENCY_MODS).toBe(false);
  });

  it("runs no prize pool", async () => {
    const { site } = await load("jp");
    expect(site.HAS_PRIZE_POOL).toBe(false);
  });

  it("rates on Elo, not Glicko-2", async () => {
    const { site } = await load("jp");
    expect(site.RATING_SYSTEM).toBe("elo");
  });

  it("shows dates on Tokyo time", async () => {
    const { site } = await load("jp");
    expect(site.DISPLAY_TIME_ZONE).toBe("Asia/Tokyo");
  });
});

describe("North America keeps every one of them", () => {
  it("still matches on distance, allows mods, pays prizes and rates on Glicko-2", async () => {
    const { site } = await load();
    expect(site.DISTANCE_MATCHMAKING).toBe(true);
    expect(site.ALLOWS_LATENCY_MODS).toBe(true);
    expect(site.HAS_PRIZE_POOL).toBe(true);
    expect(site.RATING_SYSTEM).toBe("glicko2");
    expect(site.DISPLAY_TIME_ZONE).toBe("America/New_York");
  });
});

describe("regionReachAllows", () => {
  it("lets any two Japanese prefectures match, however far apart", async () => {
    // 北海道 to 沖縄県 is ~2,200km — the pairing every finite NA preset would
    // have refused, and the one this instance has to allow.
    const { regions } = await load("jp");
    expect(regions.regionReachAllows("北海道", 0, "沖縄県")).toBe(true);
    expect(regions.regionReachAllows("沖縄県", 0, "北海道")).toBe(true);
  });

  it("lets a player with no region set match anyone", async () => {
    // Region stops gating a join when distance is off, so matchmaking has to
    // cope with it being absent rather than silently pairing nobody.
    const { regions } = await load("jp");
    expect(regions.regionReachAllows(null, null, "東京都")).toBe(true);
    expect(regions.regionReachAllows("東京都", null, null)).toBe(true);
  });

  it("drops the region filter from candidate queries", async () => {
    const { regions } = await load("jp");
    expect(regions.regionReachFilter("東京都", 0)).toBeNull();
  });

  it("still enforces distance on North America, in both directions", async () => {
    const { regions } = await load();
    expect(regions.regionReachAllows("USA East", 0, "USA Pacific")).toBe(false);
    expect(regions.regionReachAllows("USA East", null, "USA Pacific")).toBe(true);
    // A wide radius on one side must not override a tight one on the other —
    // each call answers for one player only.
    expect(regions.regionReachAllows("USA Pacific", 0, "USA East")).toBe(false);
  });

  it("refuses a region-less player on North America, where region is required", async () => {
    const { regions } = await load();
    expect(regions.regionReachAllows(null, null, "USA East")).toBe(false);
  });

  it("still returns a filter list for North America", async () => {
    const { regions } = await load();
    expect(regions.regionReachFilter("USA East", 0)).toEqual(["USA East", "Washington D.C."]);
  });
});
