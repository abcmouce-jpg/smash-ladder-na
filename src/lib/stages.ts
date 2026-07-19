// Game 1's starter stagelist. A random player strikes 1, the opponent
// strikes 2, then the first striker picks the stage from what's left.
export const GAME_ONE_STAGES = [
  "Final Destination",
  "Battlefield",
  "Small Battlefield",
  "Pokémon Stadium 2",
  "Hollow Bastion",
] as const;

// Games 2-3 add two counterpick stages. The previous game's winner strikes
// 2, and the loser picks the stage from what's left.
export const COUNTERPICK_STAGES = [...GAME_ONE_STAGES, "Smashville", "Town and City"] as const;
