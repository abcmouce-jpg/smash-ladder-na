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

export type RatingTrack = "main" | "practice" | "randitto" | "randubs";

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
  if (mode === MatchMode.RANDUBS) return "randubs";
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
    randubsRating: number;
    randubsRatingDeviation: number;
    randubsRatingVolatility: number;
    randubsGamesPlayed: number;
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
    case "randubs":
      return {
        rating: user.randubsRating,
        ratingDeviation: user.randubsRatingDeviation,
        ratingVolatility: user.randubsRatingVolatility,
        gamesPlayed: user.randubsGamesPlayed,
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

/**
 * The `data` for a user update that writes a result onto one track.
 *
 * Returning the whole object (rather than a column-name map the caller
 * assembles) keeps the three shapes in one place: a track that gained a
 * column and was only updated in two of three branches is the failure this
 * is shaped to prevent.
 */
export function writeTrack(track: RatingTrack, next: { rating: number; rd: number; volatility: number }) {
  switch (track) {
    case "practice":
      return {
        practiceRating: next.rating,
        practiceRatingDeviation: next.rd,
        practiceRatingVolatility: next.volatility,
        practiceGamesPlayed: { increment: 1 },
      };
    case "randitto":
      return {
        randittoRating: next.rating,
        randittoRatingDeviation: next.rd,
        randittoRatingVolatility: next.volatility,
        randittoGamesPlayed: { increment: 1 },
      };
    case "randubs":
      return {
        randubsRating: next.rating,
        randubsRatingDeviation: next.rd,
        randubsRatingVolatility: next.volatility,
        randubsGamesPlayed: { increment: 1 },
      };
    default:
      return {
        rating: next.rating,
        ratingDeviation: next.rd,
        ratingVolatility: next.volatility,
        gamesPlayed: { increment: 1 },
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
 * One side's rating state, averaged over its members.
 *
 * A 1v1 side has one member and this is just that player's numbers. A doubles
 * side has two, and the mean is what gets rated — then the change is handed
 * back to each member as a delta (see applyEloAndConfirm), so teammates who
 * arrived on different ratings stay apart rather than being flattened onto
 * the team's average.
 *
 * Games played takes the minimum rather than the mean, because it only feeds
 * the provisional K-factor: a veteran paired with a newcomer should not make
 * the newcomer's rating move like a veteran's.
 */
export function meanOfTrack(members: (Parameters<typeof readTrack>[0] | null)[], track: RatingTrack): TrackColumns {
  const present = members
    .filter((m): m is Parameters<typeof readTrack>[0] => m !== null)
    .map((m) => readTrack(m, track));
  if (present.length === 0) throw new Error("a side must have at least one member");
  const mean = (pick: (c: TrackColumns) => number) => present.reduce((sum, c) => sum + pick(c), 0) / present.length;
  return {
    rating: mean((c) => c.rating),
    ratingDeviation: mean((c) => c.ratingDeviation),
    ratingVolatility: mean((c) => c.ratingVolatility),
    gamesPlayed: Math.min(...present.map((c) => c.gamesPlayed)),
  };
}
