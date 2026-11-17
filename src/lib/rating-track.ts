/**
 * Which of a player's ratings a set moves.
 *
 * Three ladders share one match flow. The main one is the ladder. The
 * practice one answers "how do I do when the result does not count", and the
 * randitto one answers "how do I do on whatever I am handed" — different
 * questions, so they are different columns rather than one pooled
 * "unranked" number that answers neither.
 *
 * The track is a property of the side, not of the match: a practising player
 * can face a normal opponent, and each side writes to its own track. Randitto
 * is the exception, because the mode decides it for both sides at once.
 */
import { MatchMode } from "@/generated/prisma/enums";

export type RatingTrack = "main" | "practice" | "randitto";

/** A player's rating state on one track, as nextRatingStates wants it. */
export type TrackColumns = {
  rating: number;
  ratingDeviation: number;
  ratingVolatility: number;
  gamesPlayed: number;
};

/**
 * The track one side of a set is rated on.
 *
 * Randitto wins over the practice flag rather than combining with it — a
 * fourth "practising at randitto" ladder would be split too thin to mean
 * anything, and joinLobbyAndTryPair does not let the two be chosen together.
 */
export function trackFor(mode: MatchMode, isPracticing: boolean): RatingTrack {
  if (mode === MatchMode.RANDITTO) return "randitto";
  return isPracticing ? "practice" : "main";
}

/** Reads a player's state on a track. */
export function readTrack(
  user: {
    rating: number;
    ratingDeviation: number;
    ratingVolatility: number;
    gamesPlayed: number;
    practiceRating: number;
    practiceRatingDeviation: number;
    practiceRatingVolatility: number;
    practiceGamesPlayed: number;
    randittoRating: number;
    randittoRatingDeviation: number;
    randittoRatingVolatility: number;
    randittoGamesPlayed: number;
  },
  track: RatingTrack,
): TrackColumns {
  switch (track) {
    case "practice":
      return {
        rating: user.practiceRating,
        ratingDeviation: user.practiceRatingDeviation,
        ratingVolatility: user.practiceRatingVolatility,
        gamesPlayed: user.practiceGamesPlayed,
      };
    case "randitto":
      return {
        rating: user.randittoRating,
        ratingDeviation: user.randittoRatingDeviation,
        ratingVolatility: user.randittoRatingVolatility,
        gamesPlayed: user.randittoGamesPlayed,
      };
    default:
      return {
        rating: user.rating,
        ratingDeviation: user.ratingDeviation,
        ratingVolatility: user.ratingVolatility,
        gamesPlayed: user.gamesPlayed,
      };
  }
}

/** What a write does to the track's set counter. */
export type TrackGamesChange = "increment" | "decrement" | "keep";

/**
 * The `data` for a user update that writes a rating onto one track.
 *
 * Returning the whole object (rather than a column-name map the caller
 * assembles) keeps the three shapes in one place: a track that gained a
 * column and was only updated in two of three branches is the failure this
 * is shaped to prevent. That is also why reversals go through here rather
 * than writing `rating` directly — a cancel that restored the main columns
 * from a set played on the practice track is how a 2163 ladder rating was
 * replaced by the practice track's untouched 1500 (2026-11-11).
 *
 * `rd`/`volatility` are optional: an Elo season stores no Glicko-2 snapshot,
 * and a relative-delta correction has no honest one to write, so omitting
 * them (or passing null) leaves those columns alone.
 */
export function writeTrack(
  track: RatingTrack,
  next: { rating: number; rd?: number | null; volatility?: number | null },
  games: TrackGamesChange = "increment",
) {
  const count = games === "increment" ? { increment: 1 } : games === "decrement" ? { decrement: 1 } : undefined;
  const state = next.rd != null && next.volatility != null ? { rd: next.rd, volatility: next.volatility } : null;
  switch (track) {
    case "practice":
      return {
        practiceRating: next.rating,
        ...(state && { practiceRatingDeviation: state.rd, practiceRatingVolatility: state.volatility }),
        ...(count && { practiceGamesPlayed: count }),
      };
    case "randitto":
      return {
        randittoRating: next.rating,
        ...(state && { randittoRatingDeviation: state.rd, randittoRatingVolatility: state.volatility }),
        ...(count && { randittoGamesPlayed: count }),
      };
    default:
      return {
        rating: next.rating,
        ...(state && { ratingDeviation: state.rd, ratingVolatility: state.volatility }),
        ...(count && { gamesPlayed: count }),
      };
  }
}

/**
 * Whether a track's results belong in the things built on the main ladder:
 * the rating-over-time chart, the peak-rating stat, the leaderboard tiers and
 * the Discord tier roles. Only the main one does.
 */
export function isMainTrack(track: RatingTrack): boolean {
  return track === "main";
}

/**
 * The rating a queue matches on.
 *
 * Each mode has its own ladder, so the gap check has to compare the numbers
 * the players are actually playing for. Gating randitto on the 1v1 rating
 * kept two people who are both 1500 at randitto from matching because one of
 * them is 2300 on the main board — a restriction about a rating neither of
 * them had brought to that queue.
 */
export function queueRating(user: { rating: number; randittoRating: number }, mode: MatchMode): number {
  return mode === MatchMode.RANDITTO ? user.randittoRating : user.rating;
}

/** Sets played on the queue's own ladder — feeds the provisional widening. */
export function queueGames(user: { gamesPlayed: number; randittoGamesPlayed: number }, mode: MatchMode): number {
  return mode === MatchMode.RANDITTO ? user.randittoGamesPlayed : user.gamesPlayed;
}

/** Just the two numbers a display needs: the rating, and the sets behind it. */
export type DisplayRating = { rating: number; gamesPlayed: number };

/**
 * The rating and set count to show for one side of a set.
 *
 * Separate from readTrack because a display has no use for deviation or
 * volatility and should not have to fetch them — requiring the full state
 * is what pushed each display into choosing its own track with a ternary
 * instead, which is how the main ladder's number ended up on practice sets
 * (#115) and then again on randitto ones.
 */
export function displayRating(
  user: {
    rating: number;
    gamesPlayed: number;
    practiceRating: number;
    practiceGamesPlayed: number;
    randittoRating: number;
    randittoGamesPlayed: number;
  },
  track: RatingTrack,
): DisplayRating {
  switch (track) {
    case "practice":
      return { rating: user.practiceRating, gamesPlayed: user.practiceGamesPlayed };
    case "randitto":
      return { rating: user.randittoRating, gamesPlayed: user.randittoGamesPlayed };
    default:
      return { rating: user.rating, gamesPlayed: user.gamesPlayed };
  }
}
