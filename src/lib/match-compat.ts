// Pure "would these two people's settings allow a match" checks, shared
// between lobby.ts (actual pairing) and push-server.ts (queue-opportunity
// notifications, which score the same compatibility before ever creating a
// RatingLobbyEntry). Kept in its own module rather than living in lobby.ts
// so push-server.ts can import it without lobby.ts -> push-server.ts ->
// lobby.ts becoming a circular import.
import { PROVISIONAL_GAMES_THRESHOLD } from "@/lib/rank-tier";

export function ratingGapAllows(ratingA: number, ratingB: number, maxGap: number | null) {
  return maxGap === null || Math.abs(ratingA - ratingB) <= maxGap;
}

// A brand-new player's maxRatingGap defaults to null ("any rating") — with
// no protection, their very first games could be against a Grandmaster.
// Provisional players (see PROVISIONAL_GAMES_THRESHOLD) get their effective
// gap clamped to this regardless of their own setting; anyone who explicitly
// set something tighter keeps that instead.
export const PROVISIONAL_RATING_GAP_CAP = 300;

// The cap above protects a newcomer's first games, but it was absolute: with
// nobody inside ±300 online, a provisional player simply never matched, and
// kept not matching no matter how long they sat there. That shows up in the
// numbers — queue attempts by players with under 5 sets pair ~64% of the
// time against ~74% for established players, and someone who quits before
// getting established is the single biggest source of churn.
//
// So the cap relaxes with time waited rather than staying fixed. The first
// stretch is unchanged (a newcomer who matches quickly still gets a close
// opponent); it only widens once the strict band has demonstrably failed to
// produce anyone, which beats the alternative of no match at all.
const PROVISIONAL_GAP_STEPS: { afterMs: number; cap: number }[] = [
  { afterMs: 4 * 60 * 1000, cap: 800 },
  { afterMs: 90 * 1000, cap: 500 },
];

export function provisionalGapForWait(waitedMs: number) {
  for (const step of PROVISIONAL_GAP_STEPS) {
    if (waitedMs >= step.afterMs) return step.cap;
  }
  return PROVISIONAL_RATING_GAP_CAP;
}

// waitedMs is how long this player has been sitting in the queue. Omitted
// (0) keeps the original strict cap, which is what every non-pairing caller
// — e.g. scoring a hypothetical match for a queue-opportunity ping — wants.
export function effectiveMaxRatingGap(user: { gamesPlayed: number; maxRatingGap: number | null }, waitedMs = 0) {
  if (user.gamesPlayed >= PROVISIONAL_GAMES_THRESHOLD) return user.maxRatingGap;
  const cap = provisionalGapForWait(waitedMs);
  // An explicit tighter preference still wins — widening is about rescuing
  // someone from a dead queue, not overriding what they asked for.
  return user.maxRatingGap === null ? cap : Math.min(user.maxRatingGap, cap);
}

// Not symmetric like distance/rating gap — this checks each side's
// requirement against the OTHER side's actual wiredConnection fact, not a
// shared value both sides have their own tolerance for.
export function wiredRequirementAllows(
  a: { wiredConnection: boolean; requireWiredOpponent: boolean },
  b: { wiredConnection: boolean; requireWiredOpponent: boolean },
) {
  return (!a.requireWiredOpponent || b.wiredConnection) && (!b.requireWiredOpponent || a.wiredConnection);
}
