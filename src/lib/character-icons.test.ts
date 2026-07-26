import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import path from "path";
import { SMASH_CHARACTERS } from "@/lib/characters";
import { CHARACTER_ICON_SLUGS, characterIconSlug } from "@/lib/character-icons";

describe("CHARACTER_ICON_SLUGS", () => {
  it("maps every roster character to a slug", () => {
    for (const character of SMASH_CHARACTERS) {
      expect(CHARACTER_ICON_SLUGS[character], character).toBeTruthy();
    }
  });

  it("has a real icon file in public/characters for every mapped slug", () => {
    for (const character of SMASH_CHARACTERS) {
      const slug = CHARACTER_ICON_SLUGS[character];
      const filePath = path.resolve(__dirname, "../../public/characters", `${slug}.png`);
      expect(existsSync(filePath), `${character} -> ${slug}.png`).toBe(true);
    }
  });
});

describe("characterIconSlug", () => {
  it("returns the mapped slug for a known character", () => {
    expect(characterIconSlug("Mario")).toBe("mario");
  });

  it("returns undefined for an unrecognized name", () => {
    expect(characterIconSlug("Not A Real Fighter")).toBeUndefined();
  });
});
