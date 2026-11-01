import { describe, it, expect } from "vitest";
import { GAME_ONE_STAGES } from "@/lib/stages";
import { RANDITTO_STAGE } from "@/lib/randitto";
import { displayRating, trackFor } from "@/lib/rating-track";
import { MatchMode } from "@/generated/prisma/enums";

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

// The main ladder's number has now appeared on a set it does not belong to
// three times — practice sets once (#115), then randitto in the feed, on the
// profile card and in the lobby. The fix is that displays ask one function
// which ladder they are on rather than each deciding for itself.
describe("displayRating picks the set's own ladder", () => {
  const player = {
    rating: 1908,
    gamesPlayed: 21,
    practiceRating: 1620,
    practiceGamesPlayed: 12,
    randittoRating: 1500,
    randittoGamesPlayed: 0,
  };

  it("shows the randitto numbers for a randitto set", () => {
    expect(displayRating(player, trackFor(MatchMode.RANDITTO, false))).toEqual({ rating: 1500, gamesPlayed: 0 });
  });

  it("shows the practice numbers for a practice set", () => {
    expect(displayRating(player, trackFor(MatchMode.STANDARD, true))).toEqual({ rating: 1620, gamesPlayed: 12 });
  });

  it("shows the ladder numbers for an ordinary set", () => {
    expect(displayRating(player, trackFor(MatchMode.STANDARD, false))).toEqual({ rating: 1908, gamesPlayed: 21 });
  });

  // Randitto has its own track, so the practice flag cannot pull it back onto
  // the practice one.
  it("ignores the practice flag in randitto", () => {
    expect(displayRating(player, trackFor(MatchMode.RANDITTO, true))).toEqual({ rating: 1500, gamesPlayed: 0 });
  });
});
