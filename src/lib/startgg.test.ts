import { describe, it, expect } from "vitest";
import { normalizeStartggUrl } from "./startgg";

describe("normalizeStartggUrl", () => {
  it("accepts a valid start.gg URL", () => {
    const url = "https://start.gg/tournament/my-tourney/event/melee";
    expect(normalizeStartggUrl(url)).toBe(url);
  });

  it("accepts www.start.gg URLs", () => {
    const url = "https://www.start.gg/tournament/my-tourney";
    expect(normalizeStartggUrl(url)).toBe(url);
  });

  it("trims whitespace", () => {
    expect(normalizeStartggUrl("  https://start.gg/foo  ")).toBe("https://start.gg/foo");
  });

  it("returns null for empty string", () => {
    expect(normalizeStartggUrl("")).toBeNull();
    expect(normalizeStartggUrl("   ")).toBeNull();
  });

  it("throws for non-start.gg URLs", () => {
    expect(() => normalizeStartggUrl("https://example.com")).toThrow("start.gg");
    expect(() => normalizeStartggUrl("https://smash.gg/tourney")).toThrow("start.gg");
  });

  it("throws for http (non-https) URLs", () => {
    expect(() => normalizeStartggUrl("http://start.gg/tourney")).toThrow("start.gg");
  });
});
