import { describe, it, expect } from "vitest";
import {
  PROVISIONAL_RATING_GAP_CAP,
  confidenceMismatch,
  pairingPenalty,
  effectiveMaxRatingGap,
  provisionalGapForWait,
} from "@/lib/match-compat";

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

const NEWCOMER = { ratingDeviation: 350 };
const VETERAN = { ratingDeviation: 70 };
const MID = { ratingDeviation: 140 };

describe("RD-based pairing preference", () => {
  it("prefers the opponent whose rating is known to a similar degree", () => {
    const vsPeer = pairingPenalty(NEWCOMER, { ratingDeviation: 330 }, 0);
    const vsVeteran = pairingPenalty(NEWCOMER, VETERAN, 0);
    expect(vsPeer).toBeLessThan(vsVeteran);
  });

  it("is symmetric — a veteran likewise prefers another veteran", () => {
    expect(pairingPenalty(VETERAN, MID, 0)).toBeLessThan(pairingPenalty(VETERAN, NEWCOMER, 0));
    expect(confidenceMismatch(NEWCOMER, VETERAN)).toBe(confidenceMismatch(VETERAN, NEWCOMER));
  });

  it("lets a long wait outweigh a worse pairing, so nobody is parked", () => {
    // Freshly-queued peer vs a veteran who has been waiting a few minutes:
    // the veteran should win, since an uneven match beats no match at all.
    const freshPeer = pairingPenalty(NEWCOMER, { ratingDeviation: 350 }, 0);
    const patientVeteran = pairingPenalty(NEWCOMER, VETERAN, 5 * 60 * 1000);
    expect(patientVeteran).toBeLessThan(freshPeer);
  });

  it("still prefers the fairer match when both have waited the same", () => {
    const wait = 3 * 60 * 1000;
    expect(pairingPenalty(NEWCOMER, MID, wait)).toBeLessThan(pairingPenalty(NEWCOMER, VETERAN, wait));
  });
});
