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

export function effectiveMaxRatingGap(user: { gamesPlayed: number; maxRatingGap: number | null }) {
  if (user.gamesPlayed >= PROVISIONAL_GAMES_THRESHOLD) return user.maxRatingGap;
  return user.maxRatingGap === null
    ? PROVISIONAL_RATING_GAP_CAP
    : Math.min(user.maxRatingGap, PROVISIONAL_RATING_GAP_CAP);
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
