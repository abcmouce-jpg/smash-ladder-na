import { describe, it, expect } from "vitest";
import { PROVISIONAL_RATING_GAP_CAP, effectiveMaxRatingGap, provisionalGapForWait } from "@/lib/match-compat";

const NEW_PLAYER = { gamesPlayed: 0, maxRatingGap: null };
const ESTABLISHED = { gamesPlayed: 50, maxRatingGap: null };

describe("provisional rating-gap cap relaxes with time waited", () => {
  it("starts at the strict cap", () => {
    expect(provisionalGapForWait(0)).toBe(PROVISIONAL_RATING_GAP_CAP);
    expect(effectiveMaxRatingGap(NEW_PLAYER)).toBe(PROVISIONAL_RATING_GAP_CAP);
  });

  it("widens in steps the longer the strict band finds nobody", () => {
    const short = effectiveMaxRatingGap(NEW_PLAYER, 30 * 1000);
    const medium = effectiveMaxRatingGap(NEW_PLAYER, 2 * 60 * 1000);
    const long = effectiveMaxRatingGap(NEW_PLAYER, 10 * 60 * 1000);

    expect(short).toBe(PROVISIONAL_RATING_GAP_CAP);
    expect(medium!).toBeGreaterThan(short!);
    expect(long!).toBeGreaterThan(medium!);
  });

  it("never overrides a tighter preference the player set themselves", () => {
    const picky = { gamesPlayed: 0, maxRatingGap: 100 };
    expect(effectiveMaxRatingGap(picky, 60 * 60 * 1000)).toBe(100);
  });

  it("leaves established players alone no matter how long they wait", () => {
    expect(effectiveMaxRatingGap(ESTABLISHED, 0)).toBeNull();
    expect(effectiveMaxRatingGap(ESTABLISHED, 60 * 60 * 1000)).toBeNull();
    const capped = { gamesPlayed: 50, maxRatingGap: 200 };
    expect(effectiveMaxRatingGap(capped, 60 * 60 * 1000)).toBe(200);
  });
});
