import { describe, expect, it } from "vitest";
import { formatRating, formatTrackRating } from "@/lib/rating-format";

describe("formatRating", () => {
  it("rounds to a whole number", () => {
    expect(formatRating(1599.6)).toBe(1600);
  });
});

describe("formatTrackRating", () => {
  it("prefixes the randitto track with R", () => {
    expect(formatTrackRating(1600.4, "randitto")).toBe("R1600");
  });

  it("prefixes the practice track with P", () => {
    expect(formatTrackRating(1699.6, "practice")).toBe("P1700");
  });

  it("leaves the main ladder bare", () => {
    expect(formatTrackRating(1600.4, "main")).toBe("1600");
  });
});
