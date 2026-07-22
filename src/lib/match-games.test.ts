import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {}, TX_OPTIONS: {}, withTransientRetry: vi.fn() }));
vi.mock("@/generated/prisma/client", () => ({ Prisma: {} }));
vi.mock("@/generated/prisma/enums", () => ({ ConfirmationMethod: {}, MatchStatus: {} }));
vi.mock("@/lib/matches", () => ({ applyEloAndConfirm: vi.fn() }));
vi.mock("@/lib/discord-bot", () => ({ sendDiscordDM: vi.fn() }));

import { gameTurnState, tallySetWins, GAMES_TO_WIN } from "./match-games";

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
    const games = [
      { winnerId: "p1" },
      { winnerId: null },
      { winnerId: "p2" },
    ];
    expect(tallySetWins(games)).toEqual({ p1: 1, p2: 1 });
  });

  it("correctly tallies a 2-0 sweep", () => {
    const games = [{ winnerId: "p1" }, { winnerId: "p1" }];
    const tally = tallySetWins(games);
    expect(tally["p1"]).toBe(2);
    expect(tally["p2"]).toBeUndefined();
  });

  it("correctly tallies a 2-1 set", () => {
    const games = [
      { winnerId: "p1" },
      { winnerId: "p2" },
      { winnerId: "p1" },
    ];
    expect(tallySetWins(games)).toEqual({ p1: 2, p2: 1 });
  });
});

describe("GAMES_TO_WIN", () => {
  it("is 2 (best of 3)", () => {
    expect(GAMES_TO_WIN).toBe(2);
  });
});
