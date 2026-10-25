import { describe, it, expect, vi, afterEach } from "vitest";

// Every flag in lib/site.ts is read once at module load, so each instance has
// to be loaded under its own stubbed environment.
async function load(regionSet?: "jp") {
  vi.resetModules();
  if (regionSet) vi.stubEnv("NEXT_PUBLIC_REGION_SET", regionSet);
  return {
    site: await import("./site"),
    regions: await import("./regions"),
    stages: await import("./stages"),
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

describe("Japan's stage rules, which are Smashmate's", () => {
  it("strikes no stages at all", async () => {
    const { stages } = await load("jp");
    expect(stages.STRIKING_STAGES).toBe(false);
  });

  it("offers six stages in game 1, すま村 not among them", async () => {
    const { stages } = await load("jp");
    expect([...stages.GAME_ONE_STAGES]).toEqual([
      "Final Destination",
      "Battlefield",
      "Pokémon Stadium 2",
      "Small Battlefield",
      "Hollow Bastion",
      "Town and City",
    ]);
    expect(stages.GAME_ONE_STAGES).not.toContain("Smashville");
  });

  it("adds すま村 from game 2, and nothing else", async () => {
    const { stages } = await load("jp");
    expect(stages.COUNTERPICK_STAGES).toHaveLength(7);
    expect(stages.COUNTERPICK_STAGES).toContain("Smashville");
    // Dropped entirely — it is on North America's list, not Japan's.
    expect(stages.COUNTERPICK_STAGES).not.toContain("Kalos Pokémon League");
    const added = stages.COUNTERPICK_STAGES.filter((s) => !stages.GAME_ONE_STAGES.includes(s));
    expect(added).toEqual(["Smashville"]);
  });

  it("names the stages the way Japanese players call them", async () => {
    const { stages } = await load("jp");
    expect(stages.stageLabel("Smashville", "ja")).toBe("すま村");
    expect(stages.stageLabel("Town and City", "ja")).toBe("村と町");
    expect(stages.stageLabel("Hollow Bastion", "ja")).toBe("ホロウバスティオン");
    // The stored value is the English name, so English is a pass-through.
    expect(stages.stageLabel("Smashville", "en")).toBe("Smashville");
  });

  it("leaves North America striking its eight", async () => {
    const { stages } = await load();
    expect(stages.STRIKING_STAGES).toBe(true);
    expect(stages.GAME_ONE_STAGES).toHaveLength(5);
    expect(stages.COUNTERPICK_STAGES).toHaveLength(8);
    expect(stages.COUNTERPICK_STAGES).toContain("Kalos Pokémon League");
  });
});

describe("what the Japanese instance does not offer", () => {
  it("publishes one language and does not ask which", async () => {
    const { site } = await load("jp");
    expect([...site.SITE_LANGS]).toEqual(["ja"]);
    expect(site.DEFAULT_LANG).toBe("ja");
  });

  it("has no country or region filters", async () => {
    const { site } = await load("jp");
    expect(site.USES_REGIONS).toBe(false);
  });

  it("does not keep North America's Spanish landing page", async () => {
    const { site } = await load("jp");
    expect(site.PUBLISHES_SPANISH).toBe(false);
  });

  it("takes no donations, so nothing links to Ko-fi", async () => {
    const { site } = await load("jp");
    expect(site.HAS_KOFI).toBe(false);
  });

  it("leaves all three in place on North America", async () => {
    const { site } = await load();
    expect([...site.SITE_LANGS]).toEqual(["en", "es"]);
    expect(site.USES_REGIONS).toBe(true);
    expect(site.HAS_KOFI).toBe(true);
    expect(site.PUBLISHES_SPANISH).toBe(true);
  });
});
