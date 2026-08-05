import { describe, it, expect } from "vitest";
import { currentStreak } from "@/lib/players";

describe("currentStreak", () => {
  it("returns 0 for no matches", () => {
    expect(currentStreak([])).toBe(0);
  });

  it("counts a leading run of wins as positive", () => {
    expect(currentStreak([{ won: true }, { won: true }, { won: false }])).toBe(2);
  });

  it("counts a leading run of losses as negative", () => {
    expect(currentStreak([{ won: false }, { won: false }, { won: true }])).toBe(-2);
  });

  it("skips practice matches instead of counting them or breaking the streak", () => {
    expect(
      currentStreak([
        { won: true },
        { won: true, isPracticing: true },
        { won: true },
        { won: false },
      ]),
    ).toBe(2);
  });

  it("returns 0 when every match is practice", () => {
    expect(currentStreak([{ won: true, isPracticing: true }])).toBe(0);
  });
});
