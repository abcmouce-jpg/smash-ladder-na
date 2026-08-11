import { describe, it, expect } from "vitest";
import { formatUsagePercent, groupCharacterUsageForDisplay } from "./character-usage-display";
import type { CharacterUsage } from "./players";

function usage(character: string, usagePercent: number): CharacterUsage {
  return { character, games: usagePercent, wins: 0, losses: usagePercent, winRate: 0, usagePercent };
}

describe("groupCharacterUsageForDisplay", () => {
  it("returns no main and empty lists for an empty usage array", () => {
    const result = groupCharacterUsageForDisplay([]);
    expect(result).toEqual({ main: null, secondary: [], overflow: [] });
  });

  it("puts the single entry in main with nothing else", () => {
    const result = groupCharacterUsageForDisplay([usage("Fox", 100)]);
    expect(result.main?.character).toBe("Fox");
    expect(result.secondary).toEqual([]);
    expect(result.overflow).toEqual([]);
  });

  it("shows main even under 30% usage — it's always whichever character ranks first", () => {
    const result = groupCharacterUsageForDisplay([usage("Fox", 22)]);
    expect(result.main?.character).toBe("Fox");
  });

  it("splits 2-4 entries into main plus secondary when all clear 30% usage", () => {
    const input = [usage("Fox", 40), usage("Falco", 35), usage("Marth", 33), usage("Cloud", 30)];
    const result = groupCharacterUsageForDisplay(input);
    expect(result.main?.character).toBe("Fox");
    expect(result.secondary.map((u) => u.character)).toEqual(["Falco", "Marth", "Cloud"]);
    expect(result.overflow).toEqual([]);
  });

  it("caps secondary at 3 and moves the rest to overflow, preserving rank order", () => {
    const input = [
      usage("Fox", 40),
      usage("Falco", 35),
      usage("Marth", 34),
      usage("Cloud", 33),
      usage("Terry", 32),
      usage("Ken", 31),
    ];
    const result = groupCharacterUsageForDisplay(input);
    expect(result.main?.character).toBe("Fox");
    expect(result.secondary.map((u) => u.character)).toEqual(["Falco", "Marth", "Cloud"]);
    expect(result.overflow.map((u) => u.character)).toEqual(["Terry", "Ken"]);
  });

  it("moves a below-30% character to overflow even if it would otherwise rank in the top 3", () => {
    const input = [usage("Fox", 60), usage("Falco", 35), usage("Marth", 25), usage("Cloud", 5)];
    const result = groupCharacterUsageForDisplay(input);
    expect(result.main?.character).toBe("Fox");
    // Marth (25%) and Cloud (5%) don't clear the 30% floor, so they fall to
    // overflow even though Marth outranks nothing left to take its slot.
    expect(result.secondary.map((u) => u.character)).toEqual(["Falco"]);
    expect(result.overflow.map((u) => u.character)).toEqual(["Marth", "Cloud"]);
  });

  it("still fills all 3 secondary slots by skipping past low-usage characters in rank order", () => {
    const input = [
      usage("Fox", 50),
      usage("Falco", 40), // qualifies
      usage("Peach", 20), // skipped — under 30%
      usage("Marth", 35), // qualifies
      usage("Cloud", 10), // skipped — under 30%
      usage("Roy", 30), // qualifies (exactly at the floor)
    ];
    const result = groupCharacterUsageForDisplay(input);
    expect(result.secondary.map((u) => u.character)).toEqual(["Falco", "Marth", "Roy"]);
    expect(result.overflow.map((u) => u.character)).toEqual(["Peach", "Cloud"]);
  });
});

describe("formatUsagePercent", () => {
  it("shows <1% instead of 0% for a character that rounded down to zero", () => {
    expect(formatUsagePercent(0)).toBe("<1%");
  });

  it("shows the plain percentage otherwise", () => {
    expect(formatUsagePercent(1)).toBe("1%");
    expect(formatUsagePercent(50)).toBe("50%");
    expect(formatUsagePercent(100)).toBe("100%");
  });
});
