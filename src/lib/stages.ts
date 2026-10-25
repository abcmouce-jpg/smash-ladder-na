import type { Lang } from "@/lib/lang";
import { REGION_SET } from "@/lib/site";

// Every stage either instance can put in play. Stage names are stored in the
// database and keyed on in STAGE_IMAGE_MAP, so these English strings are the
// canonical identity of a stage everywhere; Japanese is a display concern
// handled by stageLabel() below.
const ALL_STAGES = [
  "Battlefield",
  "Small Battlefield",
  "Pokémon Stadium 2",
  "Smashville",
  "Town and City",
  "Final Destination",
  "Hollow Bastion",
  "Kalos Pokémon League",
] as const;

export type StageName = (typeof ALL_STAGES)[number];

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

// Japan runs a 7-stage list, and it is not North America's minus one: 終点 and
// ホロウバスティオン are starters here, while すま村 and 村と町 are
// counterpicks rather than game-1 options, and カロスポケモンリーグ is out
// entirely.
const JP_GAME_ONE_STAGES = [
  "Final Destination",
  "Battlefield",
  "Pokémon Stadium 2",
  "Hollow Bastion",
  "Small Battlefield",
] as const;

const JP_COUNTERPICK_STAGES = [...JP_GAME_ONE_STAGES, "Town and City", "Smashville"] as const;

// Game 1's starter stagelist. A random player strikes 1, the opponent
// strikes 2, then the first striker picks the stage from what's left.
export const GAME_ONE_STAGES: readonly StageName[] = REGION_SET === "jp" ? JP_GAME_ONE_STAGES : NA_GAME_ONE_STAGES;

// Games 2+ add the counterpick stages. The previous game's winner strikes 3,
// and the loser picks the stage from what's left — five remaining on North
// America's eight, four on Japan's seven.
export const COUNTERPICK_STAGES: readonly StageName[] =
  REGION_SET === "jp" ? JP_COUNTERPICK_STAGES : NA_COUNTERPICK_STAGES;

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

// What Japanese players call these stages — the shortenings they actually use
// (すま村, ポケスタ2) rather than transliterations of the English, since those
// are the names a stage ban gets called out by.
const STAGE_NAMES_JA: Record<string, string> = {
  Battlefield: "戦場",
  "Small Battlefield": "小戦場",
  "Pokémon Stadium 2": "ポケモンスタジアム2",
  Smashville: "すま村",
  "Town and City": "村と町",
  "Final Destination": "終点",
  "Hollow Bastion": "ホロウバスティオン",
  "Kalos Pokémon League": "カロスポケモンリーグ",
};

/**
 * A stage's name in the viewer's language. The English name is the stored
 * value, so this is only ever applied at the point of display — never to
 * something being written back or compared.
 */
export function stageLabel(stage: string, lang: Lang): string {
  if (lang !== "ja") return stage;
  return STAGE_NAMES_JA[stage] ?? stage;
}
