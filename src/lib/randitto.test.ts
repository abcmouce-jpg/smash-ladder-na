import { describe, it, expect } from "vitest";
import { GAME_ONE_STAGES } from "@/lib/stages";
import { RANDITTO_STAGE } from "@/lib/randitto";

// The site used to draw the fighters itself. It does not any more — Smash's
// own Random option rolls a fresh one every game, so drawing them here only
// meant telling players a result the game was about to produce and then
// asking them to select it by hand. What is left to assert is the one thing
// the site still decides.
describe("RANDITTO_STAGE", () => {
  it("is a stage the roster actually has", () => {
    expect(GAME_ONE_STAGES).toContain(RANDITTO_STAGE);
  });

  it("is Pokemon Stadium 2", () => {
    expect(RANDITTO_STAGE).toBe("Pokémon Stadium 2");
  });
});
