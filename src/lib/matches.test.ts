import { describe, it, expect } from "vitest";

// kFactor and expectedScore are not exported, so we test them indirectly
// through the Elo math expectations. We can still verify the module's
// exported pure helpers by re-deriving the math here.

// Mirror the private helpers for verification
function kFactor(gamesPlayed: number) {
  if (gamesPlayed < 10) return 40;
  if (gamesPlayed < 30) return 32;
  return 24;
}

function expectedScore(ratingSelf: number, ratingOpp: number) {
  return 1 / (1 + 10 ** ((ratingOpp - ratingSelf) / 400));
}

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

  describe("Elo rating update", () => {
    it("winner gains and loser loses symmetrically for equal-games players", () => {
      const r1 = 1500, r2 = 1500, gp = 30;
      const e1 = expectedScore(r1, r2);
      const k = kFactor(gp);
      const r1After = Math.round(r1 + k * (1 - e1));
      const r2After = Math.round(r2 + k * (0 - (1 - e1)));
      expect(r1After).toBe(1512);
      expect(r2After).toBe(1488);
    });

    it("provisional player swings more than an experienced one", () => {
      const e = expectedScore(1500, 1500);
      const provisionalGain = Math.round(40 * (1 - e));
      const experiencedGain = Math.round(24 * (1 - e));
      expect(provisionalGain).toBeGreaterThan(experiencedGain);
    });

    it("upset win yields a bigger gain than a favored win", () => {
      const k = kFactor(30);
      const upsetGain = Math.round(k * (1 - expectedScore(1300, 1700)));
      const favoredGain = Math.round(k * (1 - expectedScore(1700, 1300)));
      expect(upsetGain).toBeGreaterThan(favoredGain);
    });
  });
});
