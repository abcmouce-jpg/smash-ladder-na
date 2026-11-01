import { describe, it, expect } from "vitest";
import { MII_CHARACTERS, MOVESET_PATTERN, SMASH_CHARACTERS } from "@/lib/characters";
import { RANDITTO_POOL, drawRandittoPair, drawRandittoPick, drawRandittoStage } from "@/lib/randitto";

describe("randitto pool", () => {
  it("is the roster without Random", () => {
    expect(RANDITTO_POOL).not.toContain("Random");
    expect(RANDITTO_POOL).toHaveLength(SMASH_CHARACTERS.length - 1);
  });

  // Dropping the Miis would be the easy way to avoid needing a moveset, and
  // would silently make them the only fighters randitto never produces.
  it("still includes the Mii fighters", () => {
    for (const mii of MII_CHARACTERS) {
      expect(RANDITTO_POOL).toContain(mii);
    }
  });
});

describe("drawRandittoPick", () => {
  it("only ever draws from the pool, and never Random", () => {
    for (let i = 0; i < 500; i++) {
      const { character } = drawRandittoPick();
      expect(RANDITTO_POOL).toContain(character);
      expect(character).not.toBe("Random");
    }
  });

  // A Mii without a moveset is a match the pick phase would consider
  // incomplete, so this is the invariant that keeps the mode playable.
  it("gives a Mii a valid moveset and everyone else none", () => {
    for (let i = 0; i < 500; i++) {
      const { character, moveset } = drawRandittoPick();
      if ((MII_CHARACTERS as readonly string[]).includes(character)) {
        expect(moveset).toMatch(MOVESET_PATTERN);
      } else {
        expect(moveset).toBeNull();
      }
    }
  });

  it("reaches a wide spread of the roster rather than a handful", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) seen.add(drawRandittoPick().character);
    // Coupon-collector over ~86 fighters: 3000 draws covers essentially all of
    // them, so a draw stuck on a narrow slice fails here.
    expect(seen.size).toBeGreaterThan(RANDITTO_POOL.length * 0.9);
  });
});

describe("drawRandittoPair", () => {
  it("draws both sides from the pool", () => {
    for (let i = 0; i < 300; i++) {
      const { actorA, actorB } = drawRandittoPair();
      expect(RANDITTO_POOL).toContain(actorA.character);
      expect(RANDITTO_POOL).toContain(actorB.character);
    }
  });

  // The two sides are independent, so the same fighter on both is a real
  // outcome — this is the "it is not a ditto, but it may coincide" property.
  it("usually differs, and is allowed to coincide", () => {
    let same = 0;
    const runs = 2000;
    for (let i = 0; i < runs; i++) {
      const { actorA, actorB } = drawRandittoPair();
      if (actorA.character === actorB.character) same++;
    }
    // Independent draws over n fighters collide about 1/n of the time.
    expect(same).toBeGreaterThan(0);
    expect(same).toBeLessThan(runs * 0.1);
  });
});

describe("drawRandittoStage", () => {
  it("only draws from the pool it is given", () => {
    const pool = ["Battlefield", "Smashville", "Town and City"];
    for (let i = 0; i < 300; i++) {
      expect(pool).toContain(drawRandittoStage(pool));
    }
  });

  it("reaches every stage in the pool rather than favouring one", () => {
    const pool = ["Battlefield", "Smashville", "Town and City", "Final Destination"];
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(drawRandittoStage(pool));
    expect(seen.size).toBe(pool.length);
  });

  // Game 1 and games 2+ have different pools, so the caller passes which —
  // drawing game 2's counterpick stage in game 1 would quietly widen it.
  it("respects a single-stage pool", () => {
    expect(drawRandittoStage(["Battlefield"])).toBe("Battlefield");
  });
});
