import { describe, it, expect } from "vitest";
import { shouldPollLobby } from "./lobby-poll";

describe("shouldPollLobby", () => {
  it("polls while the match is active", () => {
    expect(
      shouldPollLobby({
        isInActiveMatch: true,
        isWaiting: false,
        matchJustEnded: false,
        hasLeftMatch: false,
      }),
    ).toBe(true);
  });

  it("polls while waiting in the queue", () => {
    expect(
      shouldPollLobby({
        isInActiveMatch: false,
        isWaiting: true,
        matchJustEnded: false,
        hasLeftMatch: false,
      }),
    ).toBe(true);
  });

  it("keeps polling once the match ends until the viewer leaves — the chat-visibility regression", () => {
    expect(
      shouldPollLobby({
        isInActiveMatch: false,
        isWaiting: false,
        matchJustEnded: true,
        hasLeftMatch: false,
      }),
    ).toBe(true);
  });

  it("stops polling once the viewer has left the finished match", () => {
    expect(
      shouldPollLobby({
        isInActiveMatch: false,
        isWaiting: false,
        matchJustEnded: true,
        hasLeftMatch: true,
      }),
    ).toBe(false);
  });

  it("doesn't poll when there's nothing to watch", () => {
    expect(
      shouldPollLobby({
        isInActiveMatch: false,
        isWaiting: false,
        matchJustEnded: false,
        hasLeftMatch: false,
      }),
    ).toBe(false);
  });
});
