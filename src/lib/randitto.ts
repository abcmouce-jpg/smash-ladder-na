/**
 * Randitto: both players take whatever Smash itself gives them.
 *
 * The site does not draw the fighters. Smash has a Random option and rolls a
 * fresh one every game on its own, so a site-side draw would only be telling
 * players a number the game is about to pick anyway — and then asking them to
 * go and select that exact fighter by hand, which is slower than pressing the
 * button that does it. The site's whole job here is to keep the queue
 * separate, skip the phases that no longer apply, and rate the result.
 *
 * It follows that the site genuinely does not know what anyone played, which
 * is why the feed shows a question mark rather than a fighter.
 */

/**
 * The stage every randitto game is played on.
 *
 * Fixed, not drawn. The fighters are already the variable; drawing the stage
 * too would mean a set could be decided by a stage nobody would have picked
 * for a matchup nobody picked either. Pokémon Stadium 2 is the one starter
 * with no layout quirk for a handed-out fighter to be stuck with.
 */
export const RANDITTO_STAGE = "Pokémon Stadium 2";
