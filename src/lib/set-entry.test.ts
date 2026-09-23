import { describe, expect, it } from "vitest";
import { getUnfinishedGame, isSetLive } from "@/lib/set-entry";

const games = [
  { gameNumber: 1, winnerId: "p1" },
  { gameNumber: 2, winnerId: null },
];

describe("isSetLive", () => {
  it("treats PENDING_REPORT and legacy REPORTED as live", () => {
    expect(isSetLive("PENDING_REPORT")).toBe(true);
    expect(isSetLive("REPORTED")).toBe(true);
  });

  it("treats every other status as not live", () => {
    for (const status of ["DISPUTED", "CONFIRMED", "CANCELLED", "EXPIRED"]) {
      expect(isSetLive(status)).toBe(false);
    }
  });
});

describe("getUnfinishedGame", () => {
  it("returns null when every game has a winner", () => {
    expect(getUnfinishedGame({ status: "CONFIRMED", games: [{ gameNumber: 1, winnerId: "p1" }] })).toBeNull();
  });

  it("returns null when no games exist", () => {
    expect(getUnfinishedGame({ status: "PENDING_REPORT", games: [] })).toBeNull();
  });

  it("marks the undecided game in progress while the set is still live", () => {
    expect(getUnfinishedGame({ status: "PENDING_REPORT", games })).toEqual({ gameNumber: 2, inProgress: true });
    expect(getUnfinishedGame({ status: "REPORTED", games })).toEqual({ gameNumber: 2, inProgress: true });
  });

  it("does not call a leftover game in progress once the set has ended", () => {
    // A surrender/forfeit, a cancellation, and an expiry all leave the game
    // that was in flight with winnerId null — it isn't still being played.
    for (const status of ["CONFIRMED", "CANCELLED", "EXPIRED"]) {
      expect(getUnfinishedGame({ status, games })).toEqual({ gameNumber: 2, inProgress: false });
    }
  });
});
