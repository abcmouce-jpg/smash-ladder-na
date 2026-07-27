import { describe, it, expect } from "vitest";
import { DEFAULT_ARENA_PASSWORD, effectiveArenaPassword } from "@/lib/arena";

describe("effectiveArenaPassword", () => {
  it("falls back to the shared default when unset", () => {
    expect(effectiveArenaPassword({ arenaPassword: null })).toBe(DEFAULT_ARENA_PASSWORD);
  });

  it("falls back to the shared default when set to only whitespace", () => {
    expect(effectiveArenaPassword({ arenaPassword: "   " })).toBe(DEFAULT_ARENA_PASSWORD);
  });

  it("uses the player's own password when set", () => {
    expect(effectiveArenaPassword({ arenaPassword: "5150" })).toBe("5150");
  });

  it("trims surrounding whitespace off a custom password", () => {
    expect(effectiveArenaPassword({ arenaPassword: "  5150  " })).toBe("5150");
  });
});
