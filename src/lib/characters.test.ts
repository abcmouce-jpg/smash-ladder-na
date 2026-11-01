import { describe, it, expect } from "vitest";
import {
  characterFromSlug,
  characterPageTarget,
  characterSlug,
  ECHO_FIGHTER_GROUPS,
  echoGroupCanonical,
  characterLabel,
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

describe("characterLabel", () => {
  // Japanese names lived here until 2026-11-01, when the Japanese instance was
  // shut down. Both languages the site publishes use the English roster, so
  // what is left to assert is that the label is the stored value untouched —
  // the property every caller depends on.
  it("returns the stored English name for either language", () => {
    expect(characterLabel("Bowser", "en")).toBe("Bowser");
    expect(characterLabel("Bowser", "es")).toBe("Bowser");
    expect(characterLabel("Bowser")).toBe("Bowser");
  });

  it("leaves every fighter's name exactly as stored", () => {
    for (const c of SMASH_CHARACTERS) {
      expect(characterLabel(c, "es")).toBe(c);
    }
  });
});

describe("characterSlug", () => {
  it("gives every fighter a distinct slug", () => {
    const slugs = SMASH_CHARACTERS.map(characterSlug);
    expect(new Set(slugs).size).toBe(SMASH_CHARACTERS.length);
  });

  it("produces only URL-safe segments", () => {
    for (const character of SMASH_CHARACTERS) {
      expect(characterSlug(character)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("round-trips every fighter", () => {
    for (const character of SMASH_CHARACTERS) {
      expect(characterFromSlug(characterSlug(character))).toBe(character);
    }
  });

  it("handles the names a path segment cannot carry as-is", () => {
    expect(characterSlug("Pyra/Mythra")).toBe("pyra-mythra");
    expect(characterSlug("Mr. Game & Watch")).toBe("mr-game-watch");
    expect(characterSlug("Pokémon Trainer")).toBe("pokemon-trainer");
    expect(characterSlug("R.O.B.")).toBe("r-o-b");
    expect(characterSlug("Pac-Man")).toBe("pac-man");
  });

  it("accepts a slug whatever its case, and refuses one that names no fighter", () => {
    expect(characterFromSlug("BOWSER")).toBe("Bowser");
    expect(characterFromSlug("  bowser  ")).toBe("Bowser");
    expect(characterFromSlug("goku")).toBeNull();
    expect(characterFromSlug("")).toBeNull();
  });
});

describe("characterPageTarget", () => {
  it("folds an echo into its base", () => {
    expect(characterPageTarget("Daisy")).toBe("Peach");
    expect(characterPageTarget("Dark Pit")).toBe("Pit");
  });

  it("keeps a fighter that is its own group", () => {
    expect(characterPageTarget("Fox")).toBe("Fox");
  });

  // Random is a queue option, so there is nothing to put on a page for it.
  // The sitemap and the page have to agree on this: a guide tagged Random
  // exists, and when only the page refused it the sitemap advertised a URL
  // that 404'd.
  it("refuses Random, which the page also 404s", () => {
    expect(characterPageTarget("Random")).toBeNull();
  });

  it("refuses a name that is not on the roster", () => {
    expect(characterPageTarget("Goku")).toBeNull();
    expect(characterPageTarget("")).toBeNull();
  });

  // Whatever this returns must be servable, or the sitemap can advertise a
  // 404 again.
  it("only ever returns a fighter its own slug round-trips to", () => {
    for (const character of SMASH_CHARACTERS) {
      const target = characterPageTarget(character);
      if (target === null) continue;
      expect(characterFromSlug(characterSlug(target))).toBe(target);
      expect(characterPageTarget(target)).toBe(target);
    }
  });
});
