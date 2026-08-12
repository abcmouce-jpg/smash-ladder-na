import { describe, it, expect } from "vitest";
import { eloDelta, expectedScore, getRoomHostId, kFactor, MAX_RATING_DELTA } from "@/lib/matches";

describe("Elo helpers", () => {
  describe("kFactor", () => {
    it("returns 40 for players under 10 games (provisional)", () => {
      expect(kFactor(0)).toBe(40);
      expect(kFactor(9)).toBe(40);
    });

    it("returns 32 for players with 10-29 games", () => {
      expect(kFactor(10)).toBe(32);
      expect(kFactor(29)).toBe(32);
    });

    it("returns 24 for experienced players (30+)", () => {
      expect(kFactor(30)).toBe(24);
      expect(kFactor(100)).toBe(24);
    });
  });

  describe("expectedScore", () => {
    it("returns 0.5 for equal ratings", () => {
      expect(expectedScore(1500, 1500)).toBeCloseTo(0.5);
    });

    it("returns > 0.5 when self is higher rated", () => {
      expect(expectedScore(1600, 1500)).toBeGreaterThan(0.5);
    });

    it("returns < 0.5 when self is lower rated", () => {
      expect(expectedScore(1400, 1500)).toBeLessThan(0.5);
    });

    it("exactly 400 points higher gives ~0.91", () => {
      expect(expectedScore(1900, 1500)).toBeCloseTo(0.909, 2);
    });

    it("is symmetric: E(a,b) + E(b,a) = 1", () => {
      const e1 = expectedScore(1600, 1450);
      const e2 = expectedScore(1450, 1600);
      expect(e1 + e2).toBeCloseTo(1);
    });
  });

  describe("eloDelta", () => {
    it("winner gains and loser loses symmetrically for equal-games players", () => {
      const e1 = expectedScore(1500, 1500);
      const delta1 = eloDelta(30, 1, e1);
      const delta2 = eloDelta(30, 0, 1 - e1);
      expect(Math.round(1500 + delta1)).toBe(1512);
      expect(Math.round(1500 + delta2)).toBe(1488);
    });

    it("provisional player swings more than an experienced one, below the cap", () => {
      const e = expectedScore(1500, 1500);
      const provisionalGain = eloDelta(0, 1, e);
      const experiencedGain = eloDelta(30, 1, e);
      expect(provisionalGain).toBeGreaterThan(experiencedGain);
    });

    it("upset win yields a bigger gain than a favored win, below the cap", () => {
      const upsetGain = eloDelta(30, 1, expectedScore(1300, 1700));
      const favoredGain = eloDelta(30, 1, expectedScore(1700, 1300));
      expect(upsetGain).toBeGreaterThan(favoredGain);
    });

    // The whole point: no rating gap, and no provisional kFactor, should
    // ever be able to move a rating by more than MAX_RATING_DELTA in one set.
    it("caps a massive upset at MAX_RATING_DELTA regardless of the rating gap", () => {
      const hugeUpsetExpected = expectedScore(1000, 2500); // huge underdog
      expect(eloDelta(0, 1, hugeUpsetExpected)).toBe(MAX_RATING_DELTA);
    });

    it("caps a massive upset loss at -MAX_RATING_DELTA regardless of the rating gap", () => {
      const heavyFavoriteExpected = expectedScore(2500, 1000); // huge favorite
      expect(eloDelta(0, 0, heavyFavoriteExpected)).toBe(-MAX_RATING_DELTA);
    });

    it("stays uncapped for a modest gap where the raw swing is already under the cap", () => {
      const e = expectedScore(1500, 1550);
      const raw = kFactor(30) * (1 - e);
      expect(raw).toBeLessThan(MAX_RATING_DELTA);
      expect(eloDelta(30, 1, e)).toBeCloseTo(raw);
    });
  });
});

describe("getRoomHostId", () => {
  it("always returns one of the two players", () => {
    const host = getRoomHostId("match1", "player1", "player2");
    expect(["player1", "player2"]).toContain(host);
  });

  it("is stable across repeated calls for the same match", () => {
    const first = getRoomHostId("clabc123", "p1", "p2");
    const second = getRoomHostId("clabc123", "p1", "p2");
    expect(second).toBe(first);
  });

  it("picks different hosts for at least one pair across many match ids", () => {
    const hosts = new Set<string>();
    for (let i = 0; i < 50; i++) {
      hosts.add(getRoomHostId(`match-${i}`, "p1", "p2"));
    }
    expect(hosts.size).toBe(2);
  });
});
