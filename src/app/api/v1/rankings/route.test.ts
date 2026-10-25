import { describe, it, expect } from "vitest";
import { RatingAlgorithm } from "@/generated/prisma/enums";
import { ratingSystemFamily } from "./route";

// SPSP reads this export to seed brackets. `ratingSystem` is the field it has
// been switching on since before SMASHMATE existed, so the point of these is
// that adding an algorithm never adds a value there.
describe("ratingSystemFamily", () => {
  it("keeps Smashmate inside the Elo family rather than naming a third system", () => {
    expect(ratingSystemFamily(RatingAlgorithm.SMASHMATE)).toBe("elo");
  });

  it("maps the two original algorithms to what they always reported", () => {
    expect(ratingSystemFamily(RatingAlgorithm.ELO)).toBe("elo");
    expect(ratingSystemFamily(RatingAlgorithm.GLICKO2)).toBe("glicko2");
  });

  it("answers for a season that predates the algorithm column", () => {
    // Such a season can only be Elo — the same reading applyEloAndConfirm
    // gives it.
    expect(ratingSystemFamily(null)).toBe("elo");
  });

  it("only ever returns one of the two documented values", () => {
    const every = [RatingAlgorithm.ELO, RatingAlgorithm.GLICKO2, RatingAlgorithm.SMASHMATE, null];
    for (const a of every) expect(["elo", "glicko2"]).toContain(ratingSystemFamily(a));
  });
});
