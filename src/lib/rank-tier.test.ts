import { describe, it, expect } from "vitest";
import {
  getRankTier,
  didTierUp,
  rankTierRatingRange,
  pointsToNextTier,
  RANK_TIERS,
  achievementComparator,
  type Achievement,
} from "./rank-tier";

describe("getRankTier", () => {
  it("returns null for provisional players (< 10 games)", () => {
    expect(getRankTier(2000, 9)).toBeNull();
    expect(getRankTier(1500, 0)).toBeNull();
  });

  it("returns Legend at 2100+", () => {
    expect(getRankTier(2100, 10)?.name).toBe("Legend");
    expect(getRankTier(2500, 50)?.name).toBe("Legend");
  });

  it("returns Grandmaster at 1900–2099", () => {
    expect(getRankTier(1900, 10)?.name).toBe("Grandmaster");
    expect(getRankTier(2099, 50)?.name).toBe("Grandmaster");
  });

  it("returns Master at 1750–1899", () => {
    expect(getRankTier(1750, 10)?.name).toBe("Master");
    expect(getRankTier(1899, 10)?.name).toBe("Master");
  });

  it("returns Elite at 1600–1749", () => {
    expect(getRankTier(1600, 10)?.name).toBe("Elite");
  });

  it("returns Fighter at 1450–1599", () => {
    expect(getRankTier(1500, 10)?.name).toBe("Fighter");
  });

  it("returns Challenger below 1450", () => {
    expect(getRankTier(1449, 10)?.name).toBe("Challenger");
    expect(getRankTier(0, 10)?.name).toBe("Challenger");
    expect(getRankTier(-100, 10)?.name).toBe("Challenger");
  });

  it("returns Challenger at exact boundary of 1450", () => {
    expect(getRankTier(1450, 10)?.name).toBe("Fighter");
    expect(getRankTier(1449, 10)?.name).toBe("Challenger");
  });
});

describe("didTierUp", () => {
  it("returns true when crossing into a higher tier", () => {
    expect(didTierUp(1740, 1760, 20)).toBe(true); // Elite -> Master
    expect(didTierUp(1890, 1910, 20)).toBe(true); // Master -> Grandmaster
    expect(didTierUp(2090, 2110, 20)).toBe(true); // Grandmaster -> Legend
  });

  it("returns false when staying in the same tier", () => {
    expect(didTierUp(1500, 1550, 20)).toBe(false);
  });

  it("returns false when dropping a tier", () => {
    expect(didTierUp(1760, 1740, 20)).toBe(false);
  });

  it("returns false for provisional players", () => {
    expect(didTierUp(1740, 1760, 5)).toBe(false);
  });
});

describe("rankTierRatingRange", () => {
  const rangeFor = (name: string) => rankTierRatingRange(RANK_TIERS.find((t) => t.name === name)!);

  it("leaves the top tier open-ended", () => {
    expect(rangeFor("Legend")).toBe("2100+");
  });

  it("ends a tier one point below the floor of the tier above it", () => {
    expect(rangeFor("Grandmaster")).toBe("1900 – 2099");
    expect(rangeFor("Master")).toBe("1750 – 1899");
    expect(rangeFor("Elite")).toBe("1600 – 1749");
    expect(rangeFor("Fighter")).toBe("1450 – 1599");
  });

  it("leaves the bottom tier open-ended", () => {
    expect(rangeFor("Challenger")).toBe("Under 1450");
  });

  it("describes ranges that tile the rating line with no gaps", () => {
    // One point below a tier's floor must land in the very next tier down,
    // which is what makes the displayed ranges safe to derive from the
    // neighbouring floor rather than stored separately.
    for (let i = 1; i < RANK_TIERS.length; i++) {
      expect(getRankTier(RANK_TIERS[i - 1].minRating - 1, 10)?.name).toBe(RANK_TIERS[i].name);
    }
  });
});

describe("pointsToNextTier", () => {
  it("returns null for provisional players", () => {
    expect(pointsToNextTier(2000, 5)).toBeNull();
  });

  it("returns null for the top tier (nowhere higher to climb)", () => {
    expect(pointsToNextTier(2200, 50)).toBeNull();
  });

  it("returns the next tier up and how many points away it is", () => {
    const result = pointsToNextTier(1400, 20); // Challenger, Fighter starts at 1450
    expect(result?.nextTier.name).toBe("Fighter");
    expect(result?.pointsNeeded).toBe(50);
  });

  it("stays accurate right at a tier's floor (just tiered up, next target is one tier further)", () => {
    const result = pointsToNextTier(1600, 20); // exactly Elite's floor
    expect(result?.nextTier.name).toBe("Master");
    expect(result?.pointsNeeded).toBe(150);
  });
});

describe("RANK_TIERS", () => {
  it("gives every tier a description for the Info page to render", () => {
    for (const tier of RANK_TIERS) {
      expect(tier.description.length).toBeGreaterThan(0);
    }
  });
});

describe("achievementComparator", () => {
  const achievement = (id: string, achieved: boolean): Achievement => ({
    id,
    label: id,
    description: id,
    achieved,
  });

  it("returns 0 for two achieved achievements", () => {
    expect(achievementComparator(achievement("a", true), achievement("b", true))).toBe(0);
  });

  it("returns 0 for two unachieved achievements", () => {
    expect(achievementComparator(achievement("a", false), achievement("b", false))).toBe(0);
  });

  it("sorts an achieved achievement before an unachieved one", () => {
    expect(achievementComparator(achievement("a", true), achievement("b", false))).toBeLessThan(0);
    expect(achievementComparator(achievement("a", false), achievement("b", true))).toBeGreaterThan(0);
  });

  it("moves achieved achievements to the front when sorting", () => {
    const list = [
      achievement("locked-1", false),
      achievement("locked-2", false),
      achievement("earned-1", true),
      achievement("locked-3", false),
      achievement("earned-2", true),
    ];

    const sorted = [...list].sort(achievementComparator);

    expect(sorted.map((a) => a.id)).toEqual(["earned-1", "earned-2", "locked-1", "locked-2", "locked-3"]);
  });

  it("preserves relative order within each group instead of reversing it", () => {
    // Regression test: an earlier version returned -1 (never 0) whenever
    // a.achieved === b.achieved, which is an inconsistent comparator and
    // reversed same-group elements instead of leaving them in place.
    const list = [
      achievement("earned-1", true),
      achievement("earned-2", true),
      achievement("earned-3", true),
      achievement("locked-1", false),
      achievement("locked-2", false),
      achievement("locked-3", false),
    ];

    const sorted = [...list].sort(achievementComparator);

    expect(sorted.map((a) => a.id)).toEqual(list.map((a) => a.id));
  });

  it("leaves an all-achieved list untouched", () => {
    const list = [achievement("a", true), achievement("b", true), achievement("c", true)];
    expect([...list].sort(achievementComparator).map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("leaves an all-unachieved list untouched", () => {
    const list = [achievement("a", false), achievement("b", false), achievement("c", false)];
    expect([...list].sort(achievementComparator).map((a) => a.id)).toEqual(["a", "b", "c"]);
  });
});
