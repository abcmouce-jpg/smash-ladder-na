import { describe, it, expect } from "vitest";
import { isSeasonTimeUp, seasonTimeRemaining } from "./season-countdown";

const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);

function at(secondsFromNow: number) {
  return NOW + secondsFromNow * 1000;
}

describe("seasonTimeRemaining", () => {
  it("splits the remainder into days, hours, minutes and seconds", () => {
    const endsAt = at(9 * 86400 + 4 * 3600 + 22 * 60 + 8);
    expect(seasonTimeRemaining(endsAt, NOW)).toEqual({ days: 9, hours: 4, minutes: 22, seconds: 8 });
  });

  it("keeps each unit inside its own bucket", () => {
    // 25h 61m worth of seconds still reads as 1 day 2h 1m 0s, not 25/61.
    expect(seasonTimeRemaining(at(25 * 3600 + 61 * 60), NOW)).toEqual({
      days: 1,
      hours: 2,
      minutes: 1,
      seconds: 0,
    });
  });

  it("reports zeroes for a deadline that has already passed", () => {
    expect(seasonTimeRemaining(at(-60), NOW)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it("rounds partial seconds down, so the display never hits zero early", () => {
    expect(seasonTimeRemaining(at(2.9), NOW).seconds).toBe(2);
    expect(seasonTimeRemaining(at(0.9), NOW).seconds).toBe(0);
  });
});

describe("isSeasonTimeUp", () => {
  it("is true only once every unit has run out", () => {
    expect(isSeasonTimeUp({ days: 0, hours: 0, minutes: 0, seconds: 0 })).toBe(true);
    expect(isSeasonTimeUp({ days: 0, hours: 0, minutes: 0, seconds: 1 })).toBe(false);
    expect(isSeasonTimeUp({ days: 0, hours: 0, minutes: 1, seconds: 0 })).toBe(false);
    expect(isSeasonTimeUp({ days: 0, hours: 1, minutes: 0, seconds: 0 })).toBe(false);
    expect(isSeasonTimeUp({ days: 1, hours: 0, minutes: 0, seconds: 0 })).toBe(false);
  });
});
