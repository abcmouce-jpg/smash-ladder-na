/**
 * Who is on a match, and on which side.
 *
 * A match has always had two sides. Doubles does not change that — it gives
 * each side a second member — so the shape stays `player1` vs `player2` and
 * the partner columns carry the rest. Every 1v1 mode leaves them null, which
 * is why nothing about a standard set had to change.
 *
 * These helpers exist so "is this person in this match" and "who is on this
 * side" are asked in one place. The alternative is `player1Id === userId ||
 * player2Id === userId` spread across the codebase, which is exactly the
 * check that silently excludes a doubles partner from their own match.
 */
import type { Prisma } from "@/generated/prisma/client";

export type MatchSides = {
  player1Id: string;
  player2Id: string;
  player1PartnerId?: string | null;
  player2PartnerId?: string | null;
};

/** Everyone on the match, in no particular order. Two ids for a 1v1, four for doubles. */
export function matchParticipantIds(match: MatchSides): string[] {
  return [match.player1Id, match.player2Id, match.player1PartnerId, match.player2PartnerId].filter((id): id is string =>
    Boolean(id),
  );
}

export function isMatchParticipant(match: MatchSides, userId: string): boolean {
  return matchParticipantIds(match).includes(userId);
}

/** The side a player is on, or null if they are not in the match. */
export function sideOf(match: MatchSides, userId: string): 1 | 2 | null {
  if (match.player1Id === userId || match.player1PartnerId === userId) return 1;
  if (match.player2Id === userId || match.player2PartnerId === userId) return 2;
  return null;
}

/** Both members of one side, partner first dropped when there isn't one. */
export function sideMemberIds(match: MatchSides, side: 1 | 2): string[] {
  const ids = side === 1 ? [match.player1Id, match.player1PartnerId] : [match.player2Id, match.player2PartnerId];
  return ids.filter((id): id is string => Boolean(id));
}

/**
 * A `where` clause matching every match this player is in, on either side.
 *
 * Used instead of `OR: [{ player1Id }, { player2Id }]`, which finds a 1v1 but
 * leaves a doubles partner unable to see the set they are playing in.
 */
export function participantWhere(userId: string): Prisma.RatingMatchWhereInput {
  return {
    OR: [{ player1Id: userId }, { player2Id: userId }, { player1PartnerId: userId }, { player2PartnerId: userId }],
  };
}
