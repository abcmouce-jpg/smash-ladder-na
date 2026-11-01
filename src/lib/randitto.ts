/**
 * Randitto: both players are handed a random fighter instead of picking one.
 *
 * Two separate draws, not a ditto — the two sides get different fighters. The
 * draw is re-run for every game of the set rather than once per set, so a
 * fighter nobody can play costs one game instead of the whole thing.
 *
 * Nothing here touches the database or randomness policy beyond Math.random;
 * it is split out so the draw itself can be tested, which matters because the
 * only way to notice "Random" leaking into the pool, or a Mii arriving without
 * a moveset, is to assert it.
 */
import { MII_CHARACTERS, SMASH_CHARACTERS, type SmashCharacter } from "@/lib/characters";

/**
 * The fighters the draw can produce.
 *
 * "Random" is excluded because it is a queue option rather than a fighter —
 * drawing it would hand a player a non-character and leave the match with
 * nothing to display. Everything else on the roster is in, echoes included:
 * they are distinct fighters to play even where the leaderboard groups them.
 */
export const RANDITTO_POOL: readonly SmashCharacter[] = SMASH_CHARACTERS.filter((c) => c !== "Random");

/** A fighter, plus the moveset a Mii needs and nothing else carries. */
export type RandittoPick = {
  character: SmashCharacter;
  /** Four digits, each 1-4 (see MOVESET_PATTERN) — null for every non-Mii. */
  moveset: string | null;
};

function randomMoveset(): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += String(1 + Math.floor(Math.random() * 4));
  return out;
}

/**
 * One side's fighter for one game.
 *
 * A drawn Mii gets a random moveset rather than being excluded from the pool.
 * The alternative — dropping the three Miis — would quietly make them the only
 * fighters randitto never produces, and the moveset is four digits.
 */
export function drawRandittoPick(): RandittoPick {
  const character = RANDITTO_POOL[Math.floor(Math.random() * RANDITTO_POOL.length)];
  return {
    character,
    moveset: (MII_CHARACTERS as readonly string[]).includes(character) ? randomMoveset() : null,
  };
}

/**
 * The stage every randitto game is played on.
 *
 * Fixed, not drawn. Randitto skips striking entirely — the mode exists so
 * nobody chooses, and leaving the stage negotiated made it the slowest part
 * of the fastest queue: the fighters were handed out instantly and then both
 * players sat through a strike, two strikes and a pick before game one.
 *
 * Fixed rather than random because the fighters are already the variable.
 * Drawing the stage too would mean a set could be decided by a stage nobody
 * would have picked for the matchup it happened to produce, on top of two
 * fighters nobody picked — one layer of chance is the premise, two is noise.
 * Pokémon Stadium 2 is the one starter with no meaningful layout quirk for
 * any fighter to be handed, which is what makes it the fair constant here.
 */
export const RANDITTO_STAGE = "Pokémon Stadium 2";

/**
 * Both sides' fighters for one game.
 *
 * Drawn independently, so the same fighter on both sides is possible and is
 * left alone — forcing them apart would make a genuine coincidence impossible
 * and is the opposite of what the mode is for.
 */
export function drawRandittoPair(): { actorA: RandittoPick; actorB: RandittoPick } {
  return { actorA: drawRandittoPick(), actorB: drawRandittoPick() };
}
