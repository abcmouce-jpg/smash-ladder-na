import { describe, it, expect } from "vitest";
import {
  PROVISIONAL_RATING_GAP_CAP,
  effectiveMaxMatchDistanceKm,
  effectiveMaxRatingGap,
  provisionalGapForWait,
  widenStepsForWait,
  widenedMatchDistanceKm,
  widenedRatingGap,
} from "@/lib/match-compat";
import { MATCH_RATING_GAP_PRESETS } from "@/lib/rank-tier";
import { MATCH_DISTANCE_PRESETS } from "@/lib/regions";

// The provisional cap is the site's own rule and applies regardless; these
// fixtures opt out of the player-controlled widening so each block tests one
// mechanism at a time.
const NEW_PLAYER = { gamesPlayed: 0, maxRatingGap: null, widenFiltersWhileWaiting: false };
const ESTABLISHED = { gamesPlayed: 50, maxRatingGap: null, widenFiltersWhileWaiting: false };

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
    const picky = { gamesPlayed: 0, maxRatingGap: 100, widenFiltersWhileWaiting: false };
    expect(effectiveMaxRatingGap(picky, 60 * 60 * 1000)).toBe(100);
  });

  it("leaves established players alone no matter how long they wait", () => {
    expect(effectiveMaxRatingGap(ESTABLISHED, 0)).toBeNull();
    expect(effectiveMaxRatingGap(ESTABLISHED, 60 * 60 * 1000)).toBeNull();
    const capped = { gamesPlayed: 50, maxRatingGap: 200, widenFiltersWhileWaiting: false };
    expect(effectiveMaxRatingGap(capped, 60 * 60 * 1000)).toBe(200);
  });
});

describe("widenStepsForWait", () => {
  it("holds the player's own settings for the first stretch", () => {
    expect(widenStepsForWait(0)).toBe(0);
    expect(widenStepsForWait(90 * 1000)).toBe(0);
  });

  it("adds a notch at each step of the schedule", () => {
    expect(widenStepsForWait(2 * 60 * 1000)).toBe(1);
    expect(widenStepsForWait(5 * 60 * 1000)).toBe(2);
    expect(widenStepsForWait(10 * 60 * 1000)).toBe(3);
  });

  it("stops at the last step however long the wait runs", () => {
    expect(widenStepsForWait(60 * 60 * 1000)).toBe(3);
  });
});

describe("widening walks the player's own preset list", () => {
  it("moves one preset per step", () => {
    expect(widenedRatingGap(100, 1)).toBe(150);
    expect(widenedRatingGap(100, 2)).toBe(200);
    expect(widenedRatingGap(100, 3)).toBe(300);
    expect(widenedMatchDistanceKm(640, 1)).toBe(1300);
    expect(widenedMatchDistanceKm(640, 2)).toBe(2400);
    expect(widenedMatchDistanceKm(640, 3)).toBe(5600);
  });

  it("leaves an unset limit unset — there is nothing to widen", () => {
    expect(widenedRatingGap(null, 3)).toBeNull();
    expect(widenedMatchDistanceKm(null, 3)).toBeNull();
  });

  it("never reaches the open-ended preset, so a limit stays a limit", () => {
    const widestGap = MATCH_RATING_GAP_PRESETS.filter((p) => p.gap !== null).at(-1)?.gap;
    const widestKm = MATCH_DISTANCE_PRESETS.filter((p) => p.km !== null).at(-1)?.km;
    expect(widenedRatingGap(300, 3)).toBe(widestGap);
    expect(widenedRatingGap(widestGap ?? null, 3)).toBe(widestGap);
    expect(widenedMatchDistanceKm(2400, 3)).toBe(widestKm);
    expect(widenedMatchDistanceKm(widestKm ?? null, 3)).toBe(widestKm);
  });

  it("widens a stored value that is no longer on the list", () => {
    // 2000 km sits between presets — an orphan from a past renumbering (see
    // the WARNING on MATCH_DISTANCE_PRESETS). It widens from the rung above
    // it rather than being stuck forever.
    expect(widenedMatchDistanceKm(2000, 1)).toBe(5600);
    expect(widenedMatchDistanceKm(2000, 0)).toBe(2000);
  });
});

describe("opting into widening", () => {
  const PICKY = { gamesPlayed: 50, maxRatingGap: 200, widenFiltersWhileWaiting: true };

  it("holds the player's own settings until the schedule's first step", () => {
    expect(effectiveMaxRatingGap(PICKY, 0)).toBe(200);
    expect(effectiveMaxRatingGap(PICKY, 90 * 1000)).toBe(200);
  });

  it("loosens the gap the longer nobody turns up", () => {
    expect(effectiveMaxRatingGap(PICKY, 2 * 60 * 1000)).toBe(300);
    expect(effectiveMaxRatingGap(PICKY, 10 * 60 * 1000)).toBe(500);
  });

  it("loosens the distance on the same schedule", () => {
    const far = { maxMatchDistanceKm: 640, widenFiltersWhileWaiting: true };
    expect(effectiveMaxMatchDistanceKm(far, 0)).toBe(640);
    expect(effectiveMaxMatchDistanceKm(far, 2 * 60 * 1000)).toBe(1300);
    expect(effectiveMaxMatchDistanceKm(far, 10 * 60 * 1000)).toBe(5600);
  });

  it("changes nothing for a player who left it off", () => {
    const off = { maxMatchDistanceKm: 640, widenFiltersWhileWaiting: false };
    expect(effectiveMaxMatchDistanceKm(off, 60 * 60 * 1000)).toBe(640);
    const offGap = { gamesPlayed: 50, maxRatingGap: 200, widenFiltersWhileWaiting: false };
    expect(effectiveMaxRatingGap(offGap, 60 * 60 * 1000)).toBe(200);
  });

  it("still can't push a provisional player past the provisional cap", () => {
    // Opted in, own band wide open, two minutes gone: the widening has
    // nothing to widen (null stays null) and the cap decides.
    const newcomer = { gamesPlayed: 0, maxRatingGap: null, widenFiltersWhileWaiting: true };
    expect(effectiveMaxRatingGap(newcomer, 2 * 60 * 1000)).toBe(provisionalGapForWait(2 * 60 * 1000));

    // Opted in with a band of their own: it widens, but only as far as the
    // cap for that wait allows.
    const bounded = { gamesPlayed: 0, maxRatingGap: 300, widenFiltersWhileWaiting: true };
    expect(effectiveMaxRatingGap(bounded, 10 * 60 * 1000)).toBe(Math.min(500, provisionalGapForWait(10 * 60 * 1000)));
  });
});
