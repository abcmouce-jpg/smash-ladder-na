import { describe, it, expect } from "vitest";
import {
  ECHO_FIGHTER_GROUPS,
  echoGroupCanonical,
  echoGroupLabel,
  echoGroupMembers,
  isMatchupCharacter,
  MATCHUP_CHARACTERS,
  MII_CHARACTERS,
  MOVESET_PATTERN,
  isMiiCharacter,
  SMASH_CHARACTERS,
} from "./characters";

describe("echoGroupMembers", () => {
  it("returns both sides of an echo pair, regardless of which one you start from", () => {
    expect(echoGroupMembers("Peach")).toEqual(["Peach", "Daisy"]);
    expect(echoGroupMembers("Daisy")).toEqual(["Peach", "Daisy"]);
  });

  it("returns just the character itself for anyone without an echo", () => {
    expect(echoGroupMembers("Fox")).toEqual(["Fox"]);
  });

  it("keeps Marth/Lucina and Roy/Chrom ungrouped despite being official echoes", () => {
    expect(echoGroupMembers("Marth")).toEqual(["Marth"]);
    expect(echoGroupMembers("Lucina")).toEqual(["Lucina"]);
    expect(echoGroupMembers("Roy")).toEqual(["Roy"]);
    expect(echoGroupMembers("Chrom")).toEqual(["Chrom"]);
  });
});

describe("echoGroupCanonical", () => {
  it("resolves every member of a group to the same canonical character", () => {
    expect(echoGroupCanonical("Peach")).toBe("Peach");
    expect(echoGroupCanonical("Daisy")).toBe("Peach");
  });

  it("is just the character itself for anyone without an echo", () => {
    expect(echoGroupCanonical("Fox")).toBe("Fox");
  });
});

describe("echoGroupLabel", () => {
  it("joins an echo pair into one combined label", () => {
    expect(echoGroupLabel("Peach")).toBe("Peach / Daisy");
    expect(echoGroupLabel("Daisy")).toBe("Peach / Daisy");
  });

  it("is just the plain name for anyone without an echo", () => {
    expect(echoGroupLabel("Kirby")).toBe("Kirby");
  });
});

describe("ECHO_FIGHTER_GROUPS", () => {
  it("has no character appearing in more than one group", () => {
    const seen = new Set<string>();
    for (const group of ECHO_FIGHTER_GROUPS) {
      for (const member of group) {
        expect(seen.has(member)).toBe(false);
        seen.add(member);
      }
    }
  });
});

describe("MATCHUP_CHARACTERS", () => {
  it("excludes Random", () => {
    expect(MATCHUP_CHARACTERS).not.toContain("Random");
  });

  it("keeps only each echo group's canonical member", () => {
    expect(MATCHUP_CHARACTERS).toContain("Peach");
    expect(MATCHUP_CHARACTERS).not.toContain("Daisy");
    expect(MATCHUP_CHARACTERS).toContain("Samus");
    expect(MATCHUP_CHARACTERS).not.toContain("Dark Samus");
  });

  it("keeps every non-echo fighter other than Random", () => {
    const expected = SMASH_CHARACTERS.filter((c) => c !== "Random" && echoGroupCanonical(c) === c);
    expect(MATCHUP_CHARACTERS).toEqual(expected);
  });
});

describe("isMatchupCharacter", () => {
  it("is true for a non-echo fighter", () => {
    expect(isMatchupCharacter("Mario")).toBe(true);
  });

  it("is false for Random and for echoes folded into their base fighter", () => {
    expect(isMatchupCharacter("Random")).toBe(false);
    expect(isMatchupCharacter("Daisy")).toBe(false);
  });
});

describe("MII_CHARACTERS", () => {
  it("is exactly the three Mii fighters", () => {
    expect(MII_CHARACTERS).toEqual(["Mii Brawler", "Mii Swordfighter", "Mii Gunner"]);
  });
});

describe("isMiiCharacter", () => {
  it("is true for all three Mii fighters", () => {
    expect(isMiiCharacter("Mii Brawler")).toBe(true);
    expect(isMiiCharacter("Mii Swordfighter")).toBe(true);
    expect(isMiiCharacter("Mii Gunner")).toBe(true);
  });

  it("is false for a non-Mii character", () => {
    expect(isMiiCharacter("Mario")).toBe(false);
  });

  it("is false for an unrecognized string", () => {
    expect(isMiiCharacter("Not A Character")).toBe(false);
  });
});

describe("MOVESET_PATTERN", () => {
  it("matches 4 digits, each 1-4", () => {
    expect(MOVESET_PATTERN.test("1221")).toBe(true);
    expect(MOVESET_PATTERN.test("3213")).toBe(true);
    expect(MOVESET_PATTERN.test("1111")).toBe(true);
    expect(MOVESET_PATTERN.test("4444")).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(MOVESET_PATTERN.test("123")).toBe(false);
    expect(MOVESET_PATTERN.test("12345")).toBe(false);
    expect(MOVESET_PATTERN.test("")).toBe(false);
  });

  it("rejects digits outside 1-4", () => {
    expect(MOVESET_PATTERN.test("1250")).toBe(false);
    expect(MOVESET_PATTERN.test("9999")).toBe(false);
    expect(MOVESET_PATTERN.test("0123")).toBe(false);
  });

  it("rejects non-digit characters", () => {
    expect(MOVESET_PATTERN.test("12a1")).toBe(false);
    expect(MOVESET_PATTERN.test("12 1")).toBe(false);
  });
});
