import { describe, it, expect } from "vitest";
import { assignRandubsTeams, pickMutuallyEligible, RANDUBS_PLAYERS } from "@/lib/randubs";

const key = (a: string, b: string) => [a, b].sort().join(":");

describe("pickMutuallyEligible", () => {
  const entries = ["a", "b", "c", "d", "e"].map((userId) => ({ userId }));

  it("takes the first N when nobody has blocked anybody", () => {
    expect(pickMutuallyEligible(entries, 3, new Set(), key).map((e) => e.userId)).toEqual(["a", "b", "c"]);
  });

  // The caller's own filter only compares each candidate with the joiner, so
  // two candidates who blocked each other would otherwise be put on the same
  // match without either having queued into the other.
  it("skips a candidate blocked by one already picked", () => {
    const blocked = new Set([key("a", "b")]);
    expect(pickMutuallyEligible(entries, 3, blocked, key).map((e) => e.userId)).toEqual(["a", "c", "d"]);
  });

  it("returns fewer than asked when it cannot fill the set", () => {
    const blocked = new Set([key("a", "b"), key("a", "c"), key("a", "d"), key("a", "e")]);
    expect(pickMutuallyEligible(entries, 3, blocked, key)).toHaveLength(1);
  });

  it("stops at the number asked for", () => {
    expect(pickMutuallyEligible(entries, 1, new Set(), key)).toHaveLength(1);
  });
});

describe("assignRandubsTeams", () => {
  it("puts the four players on two sides of two", () => {
    const teams = assignRandubsTeams("joiner", ["lead", "x", "y"]);
    expect(teams).not.toBeNull();
    const ids = [teams!.player1PartnerId, teams!.player2PartnerId].sort();
    expect(ids).toEqual(["x", "y"]);
  });

  // Returns null rather than throwing so a 1v1 caller can spread it blindly.
  it("is null for anything that is not a four-player set", () => {
    expect(assignRandubsTeams("joiner", ["only-one"])).toBeNull();
    expect(assignRandubsTeams("joiner", [])).toBeNull();
  });

  it("reaches both pairings rather than always the same one", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = assignRandubsTeams("joiner", ["lead", "x", "y"]);
      seen.add(`${t!.player1PartnerId}|${t!.player2PartnerId}`);
    }
    expect(seen.size).toBe(2);
  });

  it("needs four players", () => {
    expect(RANDUBS_PLAYERS).toBe(4);
  });
});
