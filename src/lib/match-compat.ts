// Pure "would these two people's settings allow a match" checks, shared
// between lobby.ts (actual pairing) and push-server.ts (queue-opportunity
// notifications, which score the same compatibility before ever creating a
// RatingLobbyEntry). Kept in its own module rather than living in lobby.ts
// so push-server.ts can import it without lobby.ts -> push-server.ts ->
// lobby.ts becoming a circular import.
import { MATCH_DISTANCE_PRESETS } from "@/lib/regions";
import { MATCH_RATING_GAP_PRESETS, PROVISIONAL_GAMES_THRESHOLD } from "@/lib/rank-tier";

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

// The cap above rescues newcomers from a dead queue, but it can only ever
// loosen a limit this site imposed — a player's OWN distance and rating-gap
// settings stayed exactly as strict at minute twenty as at second one, and on
// a thin queue those are what "nobody is online" usually means. So the same
// idea is offered to everyone as a setting (User.widenFiltersWhileWaiting):
// wait long enough with no opponent and each of the two filters steps one
// notch wider along the very preset list the player picked from, which is
// also what keeps the widening explainable ("Within 100" becomes "Within
// 150", not some number nobody chose).
//
// Both sides have to have widened for either to gain anything — a radius is
// asked of each player separately and the narrower one still wins (see
// regionReachAllows) — so this is deliberately not a silent server-side
// loosening of someone else's preference: it is each player's own setting,
// applied to their own filters, measured from their own wait.
//
// Ordered longest wait first, so the lookup below can return on the first
// match. Exported so the lobby can describe each step to the player it
// applies to (see wideningSteps in app/lobby/page.tsx) from this list rather
// than a copy of the schedule that could drift from it.
export const WIDEN_SCHEDULE: readonly { afterMs: number; steps: number }[] = [
  { afterMs: 10 * 60 * 1000, steps: 3 },
  { afterMs: 5 * 60 * 1000, steps: 2 },
  { afterMs: 2 * 60 * 1000, steps: 1 },
];

export function widenStepsForWait(waitedMs: number) {
  for (const step of WIDEN_SCHEDULE) {
    if (waitedMs >= step.afterMs) return step.steps;
  }
  return 0;
}

// The finite rungs of a preset list, ascending. The open-ended entry (null =
// "any rating" / "any distance") is dropped on purpose: widening is allowed
// to reach the widest limit a player could have chosen, never to remove the
// limit, so nobody who set a radius at all ends up matched worldwide by the
// clock alone.
function finiteRungs(presets: readonly { km?: number | null; gap?: number | null }[], key: "km" | "gap") {
  return presets.map((preset) => preset[key]).filter((value): value is number => typeof value === "number");
}

const DISTANCE_RUNGS = finiteRungs(MATCH_DISTANCE_PRESETS, "km");
const GAP_RUNGS = finiteRungs(MATCH_RATING_GAP_PRESETS, "gap");

// `steps` rungs above whatever the player chose, clamped to the widest rung.
// null in means "no limit set", which stays null — there is nothing to widen.
function widenAlong(rungs: readonly number[], value: number | null, steps: number) {
  if (value === null || steps <= 0) return value;
  // First rung at or above the stored value, so a value that is no longer on
  // the list (see the WARNING on both preset arrays about renumbering) still
  // widens from a sensible place instead of not at all.
  const start = rungs.findIndex((rung) => rung >= value);
  if (start < 0) return value;
  return Math.max(value, rungs[Math.min(start + steps, rungs.length - 1)]);
}

export function widenedRatingGap(maxRatingGap: number | null, steps: number) {
  return widenAlong(GAP_RUNGS, maxRatingGap, steps);
}

export function widenedMatchDistanceKm(maxMatchDistanceKm: number | null, steps: number) {
  return widenAlong(DISTANCE_RUNGS, maxMatchDistanceKm, steps);
}

// waitedMs is how long this player has been sitting in the queue. Omitted
// (0) keeps the original strict cap, which is what every non-pairing caller
// — e.g. scoring a hypothetical match for a queue-opportunity ping — wants.
export function effectiveMaxRatingGap(
  user: { gamesPlayed: number; maxRatingGap: number | null; widenFiltersWhileWaiting: boolean },
  waitedMs = 0,
) {
  const chosen = user.widenFiltersWhileWaiting
    ? widenedRatingGap(user.maxRatingGap, widenStepsForWait(waitedMs))
    : user.maxRatingGap;
  if (user.gamesPlayed >= PROVISIONAL_GAMES_THRESHOLD) return chosen;
  const cap = provisionalGapForWait(waitedMs);
  // The cap is applied last, over whatever the player chose and whatever the
  // widening above made of it, so it can only ever tighten: a newcomer who
  // opted into widening still cannot be handed a Grandmaster two minutes in,
  // and one who asked for a band tighter than the cap keeps it.
  return chosen === null ? cap : Math.min(chosen, cap);
}

// The distance half of the same rule. Separate function rather than a field on
// one result object because the two values are consumed in different places:
// this one feeds regionReachFilter/regionReachAllows, which turn a radius into
// a region list, while the gap above is compared against two ratings.
export function effectiveMaxMatchDistanceKm(
  user: { maxMatchDistanceKm: number | null; widenFiltersWhileWaiting: boolean },
  waitedMs = 0,
) {
  if (!user.widenFiltersWhileWaiting) return user.maxMatchDistanceKm;
  return widenedMatchDistanceKm(user.maxMatchDistanceKm, widenStepsForWait(waitedMs));
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
