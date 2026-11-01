import type { Lang } from "@/lib/lang";

// Every stage either instance can put in play. Stage names are stored in the
// database and keyed on in STAGE_IMAGE_MAP, so these English strings are the
// canonical identity of a stage everywhere; Japanese is a display concern
// handled by stageLabel() below.
export type StageName =
  | "Battlefield"
  | "Small Battlefield"
  | "Pokémon Stadium 2"
  | "Smashville"
  | "Town and City"
  | "Final Destination"
  | "Hollow Bastion"
  | "Kalos Pokémon League";

// North America: 5 starters, 3 more added from game 2 for 8 total.
const NA_GAME_ONE_STAGES = [
  "Battlefield",
  "Small Battlefield",
  "Pokémon Stadium 2",
  "Smashville",
  "Town and City",
] as const;

const NA_COUNTERPICK_STAGES = [
  ...NA_GAME_ONE_STAGES,
  "Final Destination",
  "Hollow Bastion",
  "Kalos Pokémon League",
] as const;

// Game 1's starter stagelist. A random player strikes 1, the opponent
// strikes 2, then the first striker picks the stage from what's left.
export const GAME_ONE_STAGES: readonly StageName[] = NA_GAME_ONE_STAGES;

// Games 2+ add the counterpick stages. On North America the previous game's
// winner strikes 3 and the loser picks from the five left. Japan does not
// strike: the loser picks from the whole list and the winner selects
// 「おまかせ」 in game — see STRIKING_STAGES.
export const COUNTERPICK_STAGES: readonly StageName[] = NA_COUNTERPICK_STAGES;

// Maps stage names to their image paths under /stages/.
const STAGE_IMAGE_MAP: Record<string, string> = {
  Battlefield: "battlefield.png",
  "Small Battlefield": "small_battlefield.png",
  "Pokémon Stadium 2": "pokemon_stadium.png",
  Smashville: "smashville.png",
  "Town and City": "town_and_city.png",
  "Final Destination": "final_destination.png",
  "Hollow Bastion": "hollow_bastion.png",
  "Kalos Pokémon League": "kalos.png",
};

export function stageImagePath(stage: string): string {
  return STAGE_IMAGE_MAP[stage] ?? null;
}

/**
 * A stage's name as the site shows it.
 *
 * English for both languages the site publishes — the stored value is the
 * English name and neither audience calls the stages anything else. Kept as a
 * function taking `lang` so the call sites do not have to change if a stage
 * ever needs translating again.
 */
export function stageLabel(stage: string, _lang: Lang): string {
  return stage;
}

/**
 * Whether a set decides its stages by striking.
 *
 * North America strikes: 1-2 on game 1, then 3 from the winner each game
 * after. Japan inherits Smashmate's rules instead, where nobody strikes —
 * game 1 has both players pick in game and take whatever the in-game lottery
 * gives, and from game 2 the previous game's loser simply picks while the
 * winner selects 「おまかせ」. The two are different procedures, not different
 * strike counts, so this gates the whole phase rather than a number.
 */
export const STRIKING_STAGES = true;
