import { describe, it, expect } from "vitest";
import {
  GLICKO2_INITIAL_RATING,
  GLICKO2_INITIAL_RD,
  applyGlicko2Period,
  applyGlicko2Result,
  initialGlicko2State,
  type Glicko2State,
} from "@/lib/glicko2";

describe("initialGlicko2State", () => {
  it("starts a fresh player at 1500 with maximum uncertainty", () => {
    expect(initialGlicko2State()).toEqual({ rating: 1500, rd: 350, volatility: 0.06 });
  });
});

describe("applyGlicko2Period", () => {
  // Glickman's own worked example (glicko2.pdf, "Example calculation"),
  // reproduced exactly — this is the guard that the port is faithful, since
  // the algorithm has several easy-to-transpose steps.
  it("matches Glickman's published example for a three-game period", () => {
    const before: Glicko2State = { rating: 1500, rd: 200, volatility: 0.06 };
    const after = applyGlicko2Period(before, [
      { opponentRating: 1400, opponentRd: 30, score: 1 },
      { opponentRating: 1550, opponentRd: 100, score: 0 },
      { opponentRating: 1700, opponentRd: 300, score: 0 },
    ]);

    expect(after.rating).toBeCloseTo(1464.06, 1);
    expect(after.rd).toBeCloseTo(151.52, 1);
    expect(after.volatility).toBeCloseTo(0.05999, 4);
  });

  it("leaves the rating unchanged but regenerates RD when no games are played", () => {
    const before: Glicko2State = { rating: 1620, rd: 120, volatility: 0.05 };
    const after = applyGlicko2Period(before, []);
    expect(after.rating).toBe(before.rating);
    // RD can only grow when sitting out...
    expect(after.rd).toBeGreaterThan(before.rd);
  });
});

describe("applyGlicko2Result", () => {
  it("raises the winner and lowers the loser for two equal fresh players", () => {
    const { p1, p2 } = applyGlicko2Result(initialGlicko2State(), initialGlicko2State(), 1);
    expect(p1.rating).toBeGreaterThan(GLICKO2_INITIAL_RATING);
    expect(p2.rating).toBeLessThan(GLICKO2_INITIAL_RATING);
    // Zero-sum in rating points for identical states.
    expect(p1.rating - GLICKO2_INITIAL_RATING).toBeCloseTo(GLICKO2_INITIAL_RATING - p2.rating, 6);
  });

  it("shrinks both players' RD toward certainty after a game", () => {
    const { p1, p2 } = applyGlicko2Result(initialGlicko2State(), initialGlicko2State(), 1);
    expect(p1.rd).toBeLessThan(GLICKO2_INITIAL_RD);
    expect(p2.rd).toBeLessThan(GLICKO2_INITIAL_RD);
  });

  it("moves a player far more per game while their RD is still high", () => {
    const opponent: Glicko2State = { rating: 1500, rd: 60, volatility: 0.06 };
    const established: Glicko2State = { rating: 1500, rd: 60, volatility: 0.06 };
    const fresh: Glicko2State = { rating: 1500, rd: 350, volatility: 0.06 };

    const establishedResult = applyGlicko2Result(established, opponent, 1).p1;
    const freshResult = applyGlicko2Result(fresh, opponent, 1).p1;

    expect(freshResult.rating - 1500).toBeGreaterThan(establishedResult.rating - 1500);
  });

  it("rewards an upset win more than a win over a much weaker opponent", () => {
    const me: Glicko2State = { rating: 1500, rd: 80, volatility: 0.06 };
    const stronger: Glicko2State = { rating: 1900, rd: 80, volatility: 0.06 };
    const weaker: Glicko2State = { rating: 1100, rd: 80, volatility: 0.06 };

    const upsetGain = applyGlicko2Result(me, stronger, 1).p1.rating - 1500;
    const expectedGain = applyGlicko2Result(me, weaker, 1).p1.rating - 1500;

    expect(upsetGain).toBeGreaterThan(expectedGain);
  });

  it("is symmetric: the mirrored game produces mirrored states", () => {
    const a: Glicko2State = { rating: 1620, rd: 90, volatility: 0.06 };
    const b: Glicko2State = { rating: 1480, rd: 140, volatility: 0.06 };

    const forward = applyGlicko2Result(a, b, 1); // a wins
    const backward = applyGlicko2Result(b, a, 0); // b loses — the same game

    // Same game seen from each side — a's win is b's loss.
    expect(forward.p1.rating).toBeCloseTo(backward.p2.rating, 9);
    expect(forward.p2.rating).toBeCloseTo(backward.p1.rating, 9);
  });
});
