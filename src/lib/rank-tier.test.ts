import { describe, it, expect } from "vitest";
import {
  getRankTier,
  didTierUp,
  rankTierRatingRange,
  pointsToNextTier,
  rankTiersFor,
  RANK_TIERS,
  LEGACY_RANK_TIERS,
  achievementComparator,
  computeRatingMilestoneAchievements,
  type Achievement,
} from "./rank-tier";

describe("getRankTier", () => {
  it("returns null for provisional players (< 10 games)", () => {
    expect(getRankTier(2000, 9)).toBeNull();
    expect(getRankTier(1500, 0)).toBeNull();
  });

  it("returns Legend at 2200+", () => {
    expect(getRankTier(2200, 10)?.name).toBe("Legend");
    expect(getRankTier(2500, 50)?.name).toBe("Legend");
  });

  it("returns Grandmaster at 2000–2199", () => {
    expect(getRankTier(2000, 10)?.name).toBe("Grandmaster");
    expect(getRankTier(2199, 50)?.name).toBe("Grandmaster");
  });

  it("returns Master at 1800–1999", () => {
    expect(getRankTier(1800, 10)?.name).toBe("Master");
    expect(getRankTier(1999, 10)?.name).toBe("Master");
  });

  it("returns Elite at 1600–1799", () => {
    expect(getRankTier(1600, 10)?.name).toBe("Elite");
  });

  it("returns Fighter at 1400–1599", () => {
    expect(getRankTier(1500, 10)?.name).toBe("Fighter");
  });

  it("returns Trainee below 1400", () => {
    expect(getRankTier(1399, 10)?.name).toBe("Trainee");
    expect(getRankTier(0, 10)?.name).toBe("Trainee");
    expect(getRankTier(-100, 10)?.name).toBe("Trainee");
  });

  it("returns Trainee at exact boundary of 1400", () => {
    expect(getRankTier(1400, 10)?.name).toBe("Fighter");
    expect(getRankTier(1399, 10)?.name).toBe("Trainee");
  });
});

describe("didTierUp", () => {
  it("returns true when crossing into a higher tier", () => {
    expect(didTierUp(1780, 1820, 20)).toBe(true); // Elite -> Master
    expect(didTierUp(1980, 2020, 20)).toBe(true); // Master -> Grandmaster
    expect(didTierUp(2180, 2220, 20)).toBe(true); // Grandmaster -> Legend
  });

  it("returns false when staying in the same tier", () => {
    expect(didTierUp(1500, 1550, 20)).toBe(false);
  });

  it("returns false when dropping a tier", () => {
    expect(didTierUp(1820, 1780, 20)).toBe(false);
  });

  it("returns false for provisional players", () => {
    expect(didTierUp(1740, 1760, 5)).toBe(false);
  });
});

describe("rankTierRatingRange", () => {
  const rangeFor = (name: string) => rankTierRatingRange(RANK_TIERS.find((t) => t.name === name)!);

  it("leaves the top tier open-ended", () => {
    expect(rangeFor("Legend")).toBe("2200+");
  });

  it("ends a tier one point below the floor of the tier above it", () => {
    expect(rangeFor("Grandmaster")).toBe("2000 – 2199");
    expect(rangeFor("Master")).toBe("1800 – 1999");
    expect(rangeFor("Elite")).toBe("1600 – 1799");
    expect(rangeFor("Fighter")).toBe("1400 – 1599");
  });

  it("leaves the bottom tier open-ended", () => {
    expect(rangeFor("Trainee")).toBe("Under 1400");
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
    const result = pointsToNextTier(1300, 20); // Trainee, Fighter starts at 1400
    expect(result?.nextTier.name).toBe("Fighter");
    expect(result?.pointsNeeded).toBe(100);
  });

  it("stays accurate right at a tier's floor (just tiered up, next target is one tier further)", () => {
    const result = pointsToNextTier(1600, 20); // exactly Elite's floor
    expect(result?.nextTier.name).toBe("Master");
    expect(result?.pointsNeeded).toBe(200);
  });
});

describe("rankTiersFor", () => {
  it("reads Elo (preseason) ratings against the frozen legacy ladder", () => {
    expect(rankTiersFor("ELO")).toBe(LEGACY_RANK_TIERS);
    expect(LEGACY_RANK_TIERS.map((t) => [t.name, t.minRating])).toEqual([
      ["Legend", 2100],
      ["Grandmaster", 1900],
      ["Master", 1750],
      ["Elite", 1600],
      ["Fighter", 1450],
      ["Challenger", -Infinity],
    ]);
  });

  it("reads Glicko-2 ratings against the current ladder", () => {
    expect(rankTiersFor("GLICKO2")).toBe(RANK_TIERS);
  });

  it("tiers the same rating differently under the two ladders", () => {
    // 2150 is Legend on the preseason's 2100 floor but only Grandmaster on the
    // current 2200 one; 1425 was Challenger then and is Fighter now.
    expect(getRankTier(2150, 20, LEGACY_RANK_TIERS)?.name).toBe("Legend");
    expect(getRankTier(2150, 20, RANK_TIERS)?.name).toBe("Grandmaster");
    expect(getRankTier(1425, 20, LEGACY_RANK_TIERS)?.name).toBe("Challenger");
    expect(getRankTier(1425, 20, RANK_TIERS)?.name).toBe("Fighter");
  });

  it("derives a legacy tier's range from its legacy neighbours, not the current ladder", () => {
    const legacy = (name: string) =>
      rankTierRatingRange(LEGACY_RANK_TIERS.find((t) => t.name === name)!, LEGACY_RANK_TIERS);
    expect(legacy("Legend")).toBe("2100+");
    expect(legacy("Fighter")).toBe("1450 – 1599");
    expect(legacy("Challenger")).toBe("Under 1450");
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

describe("computeRatingMilestoneAchievements", () => {
  it("gives a never-played player just the 1600 goal, unachieved", () => {
    const result = computeRatingMilestoneAchievements(null);
    expect(result).toEqual([
      { id: "rating-1600", label: "Reached 1600", description: "Reach a rating of 1600.", achieved: false },
    ]);
  });

  it("gives no achieved milestones below the first one, only the 1600 goal", () => {
    const result = computeRatingMilestoneAchievements(1550);
    expect(result.filter((a) => a.achieved)).toHaveLength(0);
    expect(result).toEqual([expect.objectContaining({ id: "rating-1600", achieved: false })]);
  });

  it("marks every 100-point step up to the rounded-down peak as achieved, plus one unachieved goal above it", () => {
    const result = computeRatingMilestoneAchievements(1750);
    expect(result.map((a) => [a.id, a.achieved])).toEqual([
      ["rating-1600", true],
      ["rating-1700", true],
      ["rating-1800", false],
    ]);
  });

  it("treats a peak that lands exactly on a milestone as achieved for that one", () => {
    const result = computeRatingMilestoneAchievements(1800);
    expect(result.map((a) => [a.id, a.achieved])).toEqual([
      ["rating-1600", true],
      ["rating-1700", true],
      ["rating-1800", true],
      ["rating-1900", false],
    ]);
  });

  it("never runs off toward the (nonexistent) rating ceiling for a very high peak", () => {
    const result = computeRatingMilestoneAchievements(2450);
    expect(result[result.length - 1]).toEqual(
      expect.objectContaining({ id: "rating-2500", achieved: false }),
    );
    expect(result.every((a) => a.achieved || a.id === "rating-2500")).toBe(true);
  });
});
