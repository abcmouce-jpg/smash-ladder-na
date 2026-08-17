import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {}, TX_OPTIONS: {}, withTransientRetry: vi.fn() }));
vi.mock("@/generated/prisma/client", () => ({ Prisma: {} }));
vi.mock("@/generated/prisma/enums", () => ({ ConfirmationMethod: {}, MatchStatus: {} }));
vi.mock("@/lib/matches", () => ({ applyEloAndConfirm: vi.fn() }));
vi.mock("@/lib/discord-bot", () => ({ sendDiscordDM: vi.fn() }));

import {
  characterPickState,
  gameTurnState,
  lastSameBans,
  lastUsedCharacter,
  tallySetWins,
  GAMES_TO_WIN,
} from "./match-games";

describe("gameTurnState", () => {
  const base = {
    actorAId: "p1",
    actorBId: "p2",
    actorAStrikes: 1,
    actorBStrikes: 2,
  };

  it("actor A strikes first (game 1: 1-2-pick pattern)", () => {
    const state = gameTurnState({ ...base, struckStages: [], finalStage: null });
    expect(state).toEqual({ phase: "striking", actorId: "p1" });
  });

  it("actor B strikes after A's first strike", () => {
    const state = gameTurnState({ ...base, struckStages: ["FD"], finalStage: null });
    expect(state).toEqual({ phase: "striking", actorId: "p2" });
  });

  it("actor B still striking on their second turn", () => {
    const state = gameTurnState({ ...base, struckStages: ["FD", "BF"], finalStage: null });
    expect(state).toEqual({ phase: "striking", actorId: "p2" });
  });

  it("after all strikes, actor A picks (fewer strikes = picker)", () => {
    const state = gameTurnState({ ...base, struckStages: ["FD", "BF", "SBF"], finalStage: null });
    expect(state).toEqual({ phase: "picking", actorId: "p1" });
  });

  it("returns done once finalStage is set", () => {
    const state = gameTurnState({ ...base, struckStages: ["FD", "BF", "SBF"], finalStage: "PS2" });
    expect(state).toEqual({ phase: "done", actorId: null });
  });

  it("counterpick game: winner strikes 2, loser picks (0 strikes)", () => {
    const counterpick = { actorAId: "winner", actorBId: "loser", actorAStrikes: 2, actorBStrikes: 0 };
    let state = gameTurnState({ ...counterpick, struckStages: [], finalStage: null });
    expect(state).toEqual({ phase: "striking", actorId: "winner" });

    state = gameTurnState({ ...counterpick, struckStages: ["FD"], finalStage: null });
    expect(state).toEqual({ phase: "striking", actorId: "winner" });

    state = gameTurnState({ ...counterpick, struckStages: ["FD", "BF"], finalStage: null });
    expect(state).toEqual({ phase: "picking", actorId: "loser" });
  });
});

describe("tallySetWins", () => {
  it("returns empty object for no games", () => {
    expect(tallySetWins([])).toEqual({});
  });

  it("counts settled games only (ignores null winnerId)", () => {
    const games = [{ winnerId: "p1" }, { winnerId: null }, { winnerId: "p2" }];
    expect(tallySetWins(games)).toEqual({ p1: 1, p2: 1 });
  });

  it("correctly tallies a 2-0 sweep", () => {
    const games = [{ winnerId: "p1" }, { winnerId: "p1" }];
    const tally = tallySetWins(games);
    expect(tally["p1"]).toBe(2);
    expect(tally["p2"]).toBeUndefined();
  });

  it("correctly tallies a 2-1 set", () => {
    const games = [{ winnerId: "p1" }, { winnerId: "p2" }, { winnerId: "p1" }];
    expect(tallySetWins(games)).toEqual({ p1: 2, p2: 1 });
  });
});

describe("GAMES_TO_WIN", () => {
  it("is 3 (best of 5)", () => {
    expect(GAMES_TO_WIN).toBe(3);
  });
});

describe("characterPickState", () => {
  const game1Base = { gameNumber: 1, actorAId: "p1", actorBId: "p2" };

  it("game 1: neither pick is visible until both have locked in", () => {
    const state = characterPickState({ ...game1Base, actorACharacter: "Mario", actorBCharacter: null }, "p1");
    expect(state).toEqual({ yourCharacter: "Mario", opponentCharacter: null, canPickNow: false });
  });

  it("game 1: the other side sees no hint either, and can still pick", () => {
    const state = characterPickState({ ...game1Base, actorACharacter: "Mario", actorBCharacter: null }, "p2");
    expect(state).toEqual({ yourCharacter: null, opponentCharacter: null, canPickNow: true });
  });

  it("game 1: both picks reveal once both are locked in", () => {
    const state = characterPickState({ ...game1Base, actorACharacter: "Mario", actorBCharacter: "Luigi" }, "p1");
    expect(state).toEqual({ yourCharacter: "Mario", opponentCharacter: "Luigi", canPickNow: false });
  });

  it("game 1: nobody has picked yet — both can pick", () => {
    const state = characterPickState({ ...game1Base, actorACharacter: null, actorBCharacter: null }, "p1");
    expect(state).toEqual({ yourCharacter: null, opponentCharacter: null, canPickNow: true });
  });

  const counterpickBase = { gameNumber: 2, actorAId: "winner", actorBId: "loser" };

  it("games 2+: actorA (previous winner) can pick first, before actorB does anything", () => {
    const state = characterPickState({ ...counterpickBase, actorACharacter: null, actorBCharacter: null }, "winner");
    expect(state).toEqual({ yourCharacter: null, opponentCharacter: null, canPickNow: true });
  });

  it("games 2+: actorB is blocked until actorA locks in", () => {
    const state = characterPickState({ ...counterpickBase, actorACharacter: null, actorBCharacter: null }, "loser");
    expect(state).toEqual({ yourCharacter: null, opponentCharacter: null, canPickNow: false });
  });

  it("games 2+: once actorA locks in, actorB sees it immediately and can react", () => {
    const state = characterPickState({ ...counterpickBase, actorACharacter: "Fox", actorBCharacter: null }, "loser");
    expect(state).toEqual({ yourCharacter: null, opponentCharacter: "Fox", canPickNow: true });
  });

  it("games 2+: actorA sees actorB's counterpick once it's in, though it's moot by then", () => {
    const state = characterPickState(
      { ...counterpickBase, actorACharacter: "Fox", actorBCharacter: "Falco" },
      "winner",
    );
    expect(state).toEqual({ yourCharacter: "Fox", opponentCharacter: "Falco", canPickNow: false });
  });
});

describe("lastUsedCharacter", () => {
  it("returns null for game 1 — no prior game to draw from", () => {
    const games = [{ gameNumber: 1, actorAId: "p1", actorBId: "p2", actorACharacter: null, actorBCharacter: null }];
    expect(lastUsedCharacter(games, "p1")).toBeNull();
  });

  it("picks up the character from the most recently finished game", () => {
    const games = [
      { gameNumber: 1, actorAId: "p1", actorBId: "p2", actorACharacter: "Fox", actorBCharacter: "Falco" },
      { gameNumber: 2, actorAId: "p2", actorBId: "p1", actorACharacter: null, actorBCharacter: null },
    ];
    expect(lastUsedCharacter(games, "p1")).toBe("Fox");
    expect(lastUsedCharacter(games, "p2")).toBe("Falco");
  });

  it("prefers the more recent game when the player counterpicked", () => {
    const games = [
      { gameNumber: 1, actorAId: "p1", actorBId: "p2", actorACharacter: "Fox", actorBCharacter: "Falco" },
      { gameNumber: 2, actorAId: "p2", actorBId: "p1", actorACharacter: "Marth", actorBCharacter: "Wolf" },
      { gameNumber: 3, actorAId: "p1", actorBId: "p2", actorACharacter: null, actorBCharacter: null },
    ];
    expect(lastUsedCharacter(games, "p1")).toBe("Wolf");
  });

  it("skips a game the player hasn't locked in yet and falls back further", () => {
    const games = [
      { gameNumber: 1, actorAId: "p1", actorBId: "p2", actorACharacter: "Fox", actorBCharacter: "Falco" },
      { gameNumber: 2, actorAId: "p2", actorBId: "p1", actorACharacter: null, actorBCharacter: null },
    ];
    // p1 hasn't picked game 2 yet — falls back to game 1's pick.
    expect(lastUsedCharacter(games, "p1")).toBe("Fox");
  });

  it("returns null if the player has no games at all", () => {
    expect(lastUsedCharacter([], "p1")).toBeNull();
  });
});

describe("lastSameBans", () => {
  it("returns null when the player has never struck 3 stages as actorA", () => {
    const games = [{ gameNumber: 1, actorAId: "p1", actorAStrikes: 1, struckStages: ["Battlefield"] }];
    expect(lastSameBans(games, "p1")).toBeNull();
  });

  it("returns the stages from the most recent completed 3-strike turn", () => {
    const games = [
      { gameNumber: 1, actorAId: "p1", actorAStrikes: 1, struckStages: ["Battlefield"] },
      {
        gameNumber: 2,
        actorAId: "p1",
        actorAStrikes: 3,
        struckStages: ["Battlefield", "Smashville", "Final Destination"],
      },
    ];
    expect(lastSameBans(games, "p1")).toEqual({
      gameNumber: 2,
      stages: ["Battlefield", "Smashville", "Final Destination"],
    });
  });

  it("prefers the more recent 3-strike turn over an earlier one", () => {
    const games = [
      {
        gameNumber: 2,
        actorAId: "p1",
        actorAStrikes: 3,
        struckStages: ["Battlefield", "Smashville", "Final Destination"],
      },
      {
        gameNumber: 4,
        actorAId: "p1",
        actorAStrikes: 3,
        struckStages: ["Hollow Bastion", "Town and City", "Kalos Pokémon League"],
      },
    ];
    expect(lastSameBans(games, "p1")).toEqual({
      gameNumber: 4,
      stages: ["Hollow Bastion", "Town and City", "Kalos Pokémon League"],
    });
  });

  it("skips a game where the player's 3-strike turn is still in progress", () => {
    const games = [
      {
        gameNumber: 2,
        actorAId: "p1",
        actorAStrikes: 3,
        struckStages: ["Battlefield", "Smashville", "Final Destination"],
      },
      { gameNumber: 4, actorAId: "p1", actorAStrikes: 3, struckStages: ["Hollow Bastion"] },
    ];
    expect(lastSameBans(games, "p1")).toEqual({
      gameNumber: 2,
      stages: ["Battlefield", "Smashville", "Final Destination"],
    });
  });

  it("ignores a game where the player was actorB, not actorA", () => {
    const games = [
      {
        gameNumber: 2,
        actorAId: "p2",
        actorAStrikes: 3,
        struckStages: ["Battlefield", "Smashville", "Final Destination"],
      },
    ];
    expect(lastSameBans(games, "p1")).toBeNull();
  });

  it("returns null if the player has no games at all", () => {
    expect(lastSameBans([], "p1")).toBeNull();
  });
});
