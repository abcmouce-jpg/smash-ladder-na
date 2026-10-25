import { describe, it, expect } from "vitest";
import {
  eloDelta,
  expectedScore,
  getRoomHostId,
  kFactor,
  MAX_RATING_DELTA,
  smashmateDelta,
  SMASHMATE_K_FACTOR,
} from "@/lib/matches";

describe("Elo helpers", () => {
  describe("kFactor", () => {
    it("returns 40 for players under 10 games", () => {
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

    it("floors a heavily-favored win at +1 instead of letting it round down to +0", () => {
      const e = expectedScore(2200, 1200); // huge favorite, raw swing rounds to ~0
      const raw = kFactor(30) * (1 - e);
      expect(raw).toBeLessThan(0.5);
      expect(eloDelta(30, 1, e)).toBe(1);
    });

    it("does not floor an all-but-certain loss — the win-only floor leaves it near-zero", () => {
      const underdogExpected = expectedScore(1200, 2200); // near-zero chance of winning
      expect(Math.abs(eloDelta(30, 0, underdogExpected))).toBeLessThan(1);
    });
  });
});

// The numbers a Smashmate player already knows, pinned against the curve a
// flat K of 32 produces: 16 on a win between equal ratings, and one point
// less (or one more, on the upset) for every 25 points of rating gap. These
// came from Smashmate's own rating simulation write-up, and they are the
// reason this is a separate algorithm rather than a kFactor tweak.
describe("smashmateDelta", () => {
  // [gap, what the higher-rated player gains by winning, what the lower-rated
  // player gains by winning]
  const TABLE: readonly [number, number, number][] = [
    [0, 16, 16],
    [25, 15, 17],
    [50, 14, 18],
    [75, 13, 19],
    [100, 12, 20],
  ];

  for (const [gap, favored, upset] of TABLE) {
    it(`moves ${favored}/${upset} at a ${gap}-point gap`, () => {
      const high = 1500 + gap;
      const low = 1500;
      expect(Math.round(smashmateDelta(1, expectedScore(high, low)))).toBe(favored);
      expect(Math.round(smashmateDelta(1, expectedScore(low, high)))).toBe(upset);
      // A loss is the mirror of the opponent's win, so the set is zero-sum
      // before rounding.
      expect(smashmateDelta(1, expectedScore(high, low)) + smashmateDelta(0, expectedScore(low, high))).toBeCloseTo(0);
    });
  }

  it("swings the same amount on a player's first set as on their four-hundredth", () => {
    const e = expectedScore(1500, 1600);
    // eloDelta tapers 40 -> 32 -> 24 over a player's first 30 sets; this does
    // not depend on games played at all, which is the whole difference.
    expect(eloDelta(0, 1, e)).not.toBeCloseTo(eloDelta(100, 1, e));
    expect(smashmateDelta(1, e)).toBeCloseTo(SMASHMATE_K_FACTOR * (1 - e));
  });

  it("caps a single set at MAX_RATING_DELTA, as Smashmate did at 30", () => {
    expect(MAX_RATING_DELTA).toBe(30);
    expect(smashmateDelta(1, expectedScore(1000, 2500))).toBe(MAX_RATING_DELTA);
    expect(smashmateDelta(0, expectedScore(2500, 1000))).toBe(-MAX_RATING_DELTA);
  });

  it("never reports a win as +0", () => {
    // K=32 against a 1,500-point-lower opponent is worth well under half a
    // point, which would round to +0 on the victory screen.
    const e = expectedScore(2500, 1000);
    expect(SMASHMATE_K_FACTOR * (1 - e)).toBeLessThan(1);
    expect(smashmateDelta(1, e)).toBe(1);
  });
});

describe("getRoomHostId", () => {
  it("always returns one of the two players", () => {
    const host = getRoomHostId({ id: "match1", player1Id: "player1", player2Id: "player2", roomCodeSetById: null });
    expect(["player1", "player2"]).toContain(host);
  });

  it("is stable across repeated calls for the same match", () => {
    const match = { id: "clabc123", player1Id: "p1", player2Id: "p2", roomCodeSetById: null };
    expect(getRoomHostId(match)).toBe(getRoomHostId(match));
  });

  it("picks different hosts for at least one pair across many match ids", () => {
    const hosts = new Set<string>();
    for (let i = 0; i < 50; i++) {
      hosts.add(getRoomHostId({ id: `match-${i}`, player1Id: "p1", player2Id: "p2", roomCodeSetById: null }));
    }
    expect(hosts.size).toBe(2);
  });

  it("returns roomCodeSetById directly when already set, regardless of the hash", () => {
    // match1/player1/player2 hashes to "player1" per the first test above —
    // an explicit roomCodeSetById of "player2" must still win.
    const host = getRoomHostId({
      id: "match1",
      player1Id: "player1",
      player2Id: "player2",
      roomCodeSetById: "player2",
    });
    expect(host).toBe("player2");
  });
});
