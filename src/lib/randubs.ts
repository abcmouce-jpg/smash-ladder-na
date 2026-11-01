/**
 * Random doubles: four players, two random teams of two.
 *
 * Doubles rides the existing two-side match shape — player1/player2 are the
 * sides, and the partner columns carry each side's second member — so the
 * reporting, dispute, timeout and cancellation flows all keep working as
 * written. What this file owns is the part that is genuinely new: choosing
 * four people who may all play each other, and drawing the teams.
 */

/** How many people a randubs set needs. */
export const RANDUBS_PLAYERS = 4;

/**
 * Picks `needed` entries that are eligible against each other, not just
 * against the joiner.
 *
 * The caller's own filter is pairwise against whoever is joining, which is
 * all a 1v1 needs. A doubles set puts four people on one match, so two of
 * them who have blocked each other would otherwise end up as teammates or
 * opponents without either ever having queued into the other. Blocks are the
 * rule that must hold between every pair; the rest (rating gap, region,
 * rematch cooldown) are the joiner's preferences and are left as they are.
 */
export function pickMutuallyEligible<T extends { userId: string }>(
  eligible: readonly T[],
  needed: number,
  blockedPairKeys: ReadonlySet<string>,
  pairKey: (a: string, b: string) => string,
): T[] {
  const picked: T[] = [];
  for (const candidate of eligible) {
    if (picked.some((p) => blockedPairKeys.has(pairKey(p.userId, candidate.userId)))) continue;
    picked.push(candidate);
    if (picked.length === needed) break;
  }
  return picked;
}

/**
 * Splits four players into the two sides of a match.
 *
 * Returns null for anything that is not a four-player set, so a 1v1 caller
 * can spread the result unconditionally and get nothing.
 *
 * The caller already fixed player1Id and player2Id — one of the picked
 * entries and the joiner — so this only decides which of the remaining two
 * partners each of them gets. That is the whole randomness the mode needs:
 * with the two side leads fixed, a coin flip over the other two produces
 * both possible pairings with equal chance.
 */
export function assignRandubsTeams(
  joinerId: string,
  pickedIds: readonly string[],
): { player1PartnerId: string; player2PartnerId: string } | null {
  if (pickedIds.length !== RANDUBS_PLAYERS - 1) return null;
  const [side1Lead, ...rest] = pickedIds;
  if (!side1Lead || rest.length !== 2) return null;
  void joinerId; // side 2's lead; named for the reader, not needed here
  const flip = Math.random() < 0.5;
  return {
    player1PartnerId: flip ? rest[0] : rest[1],
    player2PartnerId: flip ? rest[1] : rest[0],
  };
}
