import { describe, it, expect } from "vitest";
import { resolveQuickMessages, DEFAULT_QUICK_MESSAGES } from "./quick-messages";

describe("resolveQuickMessages", () => {
  it("falls back to the site defaults entirely when nothing is saved", () => {
    expect(resolveQuickMessages([])).toEqual(DEFAULT_QUICK_MESSAGES);
  });

  it("uses saved values where present", () => {
    expect(resolveQuickMessages(["yo", "gg"])).toEqual(["yo", "gg", DEFAULT_QUICK_MESSAGES[2], DEFAULT_QUICK_MESSAGES[3]]);
  });

  it("falls back per-slot on a blank in the middle, without shifting later slots", () => {
    expect(resolveQuickMessages(["yo", "", "nice game"])).toEqual([
      "yo",
      DEFAULT_QUICK_MESSAGES[1],
      "nice game",
      DEFAULT_QUICK_MESSAGES[3],
    ]);
  });

  it("trims whitespace-only slots back to the default", () => {
    expect(resolveQuickMessages(["  ", "gg"])).toEqual([DEFAULT_QUICK_MESSAGES[0], "gg", DEFAULT_QUICK_MESSAGES[2], DEFAULT_QUICK_MESSAGES[3]]);
  });
});
