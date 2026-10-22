import { describe, it, expect } from "vitest";
import {
  shouldPollLobby,
  shouldRefresh,
  POLL_INTERVAL_MS,
  BACKGROUND_PUSH_INTERVAL_MS,
} from "./lobby-poll";

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

describe("shouldRefresh", () => {
  const base = {
    visible: false,
    keepPollingInBackground: false,
    hasPushSubscription: false,
    msSinceLastRefresh: POLL_INTERVAL_MS,
  };

  it("refreshes every tick while the tab is visible", () => {
    // Including the combination that is throttled when hidden — visibility is
    // checked first on purpose, so returning to the tab is always instant.
    expect(
      shouldRefresh({
        ...base,
        visible: true,
        keepPollingInBackground: true,
        hasPushSubscription: true,
        msSinceLastRefresh: 0,
      }),
    ).toBe(true);
  });

  it("never refreshes a hidden tab that is not waiting", () => {
    expect(shouldRefresh({ ...base, msSinceLastRefresh: 10 * 60 * 1000 })).toBe(false);
  });

  it("keeps the old cadence for a hidden waiting tab with no push subscription", () => {
    // These players have no other way of being told, so nothing changes for
    // them: this is the auto-forfeit case keepPollingInBackground exists for.
    expect(
      shouldRefresh({ ...base, keepPollingInBackground: true, msSinceLastRefresh: 0 }),
    ).toBe(true);
  });

  it("throttles a hidden waiting tab that is push-subscribed", () => {
    const hiddenWithPush = {
      ...base,
      keepPollingInBackground: true,
      hasPushSubscription: true,
    };
    expect(shouldRefresh({ ...hiddenWithPush, msSinceLastRefresh: 0 })).toBe(false);
    expect(
      shouldRefresh({ ...hiddenWithPush, msSinceLastRefresh: BACKGROUND_PUSH_INTERVAL_MS - 1 }),
    ).toBe(false);
    expect(
      shouldRefresh({ ...hiddenWithPush, msSinceLastRefresh: BACKGROUND_PUSH_INTERVAL_MS }),
    ).toBe(true);
  });

  it("stays well inside the 60s striking window even if the push is lost", () => {
    // STRIKE_TIMEOUT_MS in lib/match-games.ts. The fallback has to surface the
    // match with enough of that window left to actually strike.
    expect(BACKGROUND_PUSH_INTERVAL_MS).toBeLessThan(60_000 / 2);
  });

  it("only ever skips ticks, never polls faster than before", () => {
    expect(BACKGROUND_PUSH_INTERVAL_MS).toBeGreaterThan(POLL_INTERVAL_MS);
  });
});
