import { describe, it, expect } from "vitest";
import {
  hasJackOfTrades,
  hasMirrorMatch,
  hasRiskyBusiness,
  hasGlobetrotter,
  hasGrudgeMatch,
  hasBeginnersLuck,
  hasBounceBack,
  type AchievementGame,
  type AchievementMatch,
} from "./match-achievements";
import { COUNTERPICK_STAGES } from "./stages";

const ME = "me";
const OPP = "opp";

function game(overrides: Partial<AchievementGame> = {}): AchievementGame {
  return {
    actorAId: ME,
    actorACharacter: "Mario",
    actorBId: OPP,
    actorBCharacter: "Fox",
    winnerId: ME,
    finalStage: "Battlefield",
    ...overrides,
  };
}

function match(overrides: Partial<AchievementMatch> = {}): AchievementMatch {
  return {
    opponentId: OPP,
    won: true,
    confirmedAt: new Date("2026-01-01T00:00:00Z"),
    games: [game()],
    ...overrides,
  };
}

describe("hasJackOfTrades", () => {
  it("true when every game in a won set used a different character", () => {
    const m = match({
      games: [
        game({ actorACharacter: "Mario" }),
        game({ actorACharacter: "Fox" }),
        game({ actorACharacter: "Pikachu" }),
      ],
    });
    expect(hasJackOfTrades([m], ME)).toBe(true);
  });

  it("false when a character repeats", () => {
    const m = match({
      games: [game({ actorACharacter: "Mario" }), game({ actorACharacter: "Mario" }), game({ actorACharacter: "Fox" })],
    });
    expect(hasJackOfTrades([m], ME)).toBe(false);
  });

  it("false when the set was lost", () => {
    const m = match({
      won: false,
      games: [game({ actorACharacter: "Mario" }), game({ actorACharacter: "Fox" })],
    });
    expect(hasJackOfTrades([m], ME)).toBe(false);
  });
});

describe("hasMirrorMatch", () => {
  it("true when both sides used the same character the whole set", () => {
    const m = match({
      games: [
        game({ actorACharacter: "Fox", actorBCharacter: "Fox" }),
        game({ actorACharacter: "Fox", actorBCharacter: "Fox" }),
      ],
    });
    expect(hasMirrorMatch([m], ME)).toBe(true);
  });

  it("false when I switched characters mid-set even if matched each game", () => {
    const m = match({
      games: [
        game({ actorACharacter: "Fox", actorBCharacter: "Fox" }),
        game({ actorACharacter: "Falco", actorBCharacter: "Falco" }),
      ],
    });
    expect(hasMirrorMatch([m], ME)).toBe(false);
  });

  it("false when characters don't match between players", () => {
    const m = match({ games: [game({ actorACharacter: "Fox", actorBCharacter: "Falco" })] });
    expect(hasMirrorMatch([m], ME)).toBe(false);
  });
});

describe("hasRiskyBusiness", () => {
  it("true for games 1-4 same character, game 5 a swap, set won", () => {
    const m = match({
      games: [
        game({ actorACharacter: "Mario" }),
        game({ actorACharacter: "Mario" }),
        game({ actorACharacter: "Mario" }),
        game({ actorACharacter: "Mario" }),
        game({ actorACharacter: "Luigi" }),
      ],
    });
    expect(hasRiskyBusiness([m], ME)).toBe(true);
  });

  it("false when the set didn't go 5 games", () => {
    const m = match({
      games: [game({ actorACharacter: "Mario" }), game({ actorACharacter: "Mario" }), game({ actorACharacter: "Luigi" })],
    });
    expect(hasRiskyBusiness([m], ME)).toBe(false);
  });

  it("false when game 5 uses the same character as games 1-4", () => {
    const m = match({
      games: Array.from({ length: 5 }, () => game({ actorACharacter: "Mario" })),
    });
    expect(hasRiskyBusiness([m], ME)).toBe(false);
  });
});

describe("hasGlobetrotter", () => {
  it("true once a game has been won on every stage", () => {
    const games = COUNTERPICK_STAGES.map((stage) => game({ finalStage: stage, winnerId: ME }));
    expect(hasGlobetrotter([match({ games })], ME)).toBe(true);
  });

  it("false when one stage is missing", () => {
    const games = COUNTERPICK_STAGES.slice(0, -1).map((stage) => game({ finalStage: stage, winnerId: ME }));
    expect(hasGlobetrotter([match({ games })], ME)).toBe(false);
  });

  it("doesn't count a stage the opponent won on", () => {
    const games = COUNTERPICK_STAGES.map((stage) => game({ finalStage: stage, winnerId: OPP }));
    expect(hasGlobetrotter([match({ games })], ME)).toBe(false);
  });
});

describe("hasGrudgeMatch", () => {
  it("true when the previous meeting with this opponent was a loss", () => {
    const matches = [match({ won: false }), match({ won: true })];
    expect(hasGrudgeMatch(matches)).toBe(true);
  });

  it("false on a first-ever meeting", () => {
    expect(hasGrudgeMatch([match({ won: true })])).toBe(false);
  });

  it("false when the previous meeting was also a win", () => {
    const matches = [match({ won: true }), match({ won: true })];
    expect(hasGrudgeMatch(matches)).toBe(false);
  });

  it("ignores other opponents interleaved in between", () => {
    const other = "other-opp";
    const matches = [
      match({ opponentId: OPP, won: false }),
      match({ opponentId: other, won: true }),
      match({ opponentId: OPP, won: true }),
    ];
    expect(hasGrudgeMatch(matches)).toBe(true);
  });
});

describe("hasBeginnersLuck", () => {
  it("true when the first set of some day was a win", () => {
    const matches = [match({ confirmedAt: new Date("2026-01-01T09:00:00Z"), won: true })];
    expect(hasBeginnersLuck(matches, "UTC")).toBe(true);
  });

  it("false when the first set of every day was a loss", () => {
    const matches = [
      match({ confirmedAt: new Date("2026-01-01T09:00:00Z"), won: false }),
      match({ confirmedAt: new Date("2026-01-01T10:00:00Z"), won: true }),
    ];
    expect(hasBeginnersLuck(matches, "UTC")).toBe(false);
  });

  it("buckets days in the given timezone, not UTC", () => {
    // 02:00 UTC is the previous day in New York (UTC-5 in January): the loss
    // lands on Dec 31 while the win is the first set of Jan 1 there, even
    // though UTC puts both on Jan 1.
    const matches = [
      match({ confirmedAt: new Date("2026-01-01T02:00:00Z"), won: false }),
      match({ confirmedAt: new Date("2026-01-01T10:00:00Z"), won: true }),
    ];
    expect(hasBeginnersLuck(matches, "UTC")).toBe(false);
    expect(hasBeginnersLuck(matches, "America/New_York")).toBe(true);
  });

  it("falls back to UTC for a bogus timezone", () => {
    const matches = [match({ confirmedAt: new Date("2026-01-01T02:00:00Z"), won: true })];
    expect(hasBeginnersLuck(matches, "Not/AZone")).toBe(true);
  });
});

describe("hasBounceBack", () => {
  it("true when the day's first set was a loss and the very next set is a win", () => {
    const matches = [
      match({ confirmedAt: new Date("2026-01-01T09:00:00Z"), won: false }),
      match({ confirmedAt: new Date("2026-01-01T10:00:00Z"), won: true }),
    ];
    expect(hasBounceBack(matches, "UTC")).toBe(true);
  });

  it("false when the next set is also a loss", () => {
    const matches = [
      match({ confirmedAt: new Date("2026-01-01T09:00:00Z"), won: false }),
      match({ confirmedAt: new Date("2026-01-01T10:00:00Z"), won: false }),
    ];
    expect(hasBounceBack(matches, "UTC")).toBe(false);
  });

  it("false when there's no set played after the day's first loss", () => {
    const matches = [match({ confirmedAt: new Date("2026-01-01T09:00:00Z"), won: false })];
    expect(hasBounceBack(matches, "UTC")).toBe(false);
  });

  it("the bounce-back set can be on a later day", () => {
    const matches = [
      match({ confirmedAt: new Date("2026-01-01T09:00:00Z"), won: false }),
      match({ confirmedAt: new Date("2026-01-02T09:00:00Z"), won: true }),
    ];
    expect(hasBounceBack(matches, "UTC")).toBe(true);
  });

  it("buckets days in the given timezone, not UTC", () => {
    // In UTC all three sets share Jan 1: the day's first set (a loss) is
    // followed by another loss, so no bounce. In New York (UTC-5 in
    // January) the 02:00 loss falls on Dec 31, making the 10:00 loss the
    // first set of Jan 1 — and the very next set is a win.
    const matches = [
      match({ confirmedAt: new Date("2026-01-01T02:00:00Z"), won: false }),
      match({ confirmedAt: new Date("2026-01-01T10:00:00Z"), won: false }),
      match({ confirmedAt: new Date("2026-01-01T11:00:00Z"), won: true }),
    ];
    expect(hasBounceBack(matches, "UTC")).toBe(false);
    expect(hasBounceBack(matches, "America/New_York")).toBe(true);
  });

  it("falls back to UTC for a bogus timezone", () => {
    const matches = [
      match({ confirmedAt: new Date("2026-01-01T09:00:00Z"), won: false }),
      match({ confirmedAt: new Date("2026-01-01T10:00:00Z"), won: true }),
    ];
    expect(hasBounceBack(matches, "Not/AZone")).toBe(true);
  });
});
