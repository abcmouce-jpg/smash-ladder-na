import { describe, expect, it } from "vitest";
import { rankCardUrl, tweetIntentUrl } from "./share";

describe("tweetIntentUrl", () => {
  it("encodes the text and the url into a single parameter", () => {
    const url = tweetIntentUrl("elfy is rated 1673 on Smash Ladder NA.", "https://example.com/players/abc");
    expect(url).toBe(
      "https://twitter.com/intent/tweet?text=elfy%20is%20rated%201673%20on%20Smash%20Ladder%20NA.%20https%3A%2F%2Fexample.com%2Fplayers%2Fabc",
    );
  });

  // A share text carries a rank tier in parentheses and, for Spanish, an
  // opening "¡" — and "&"/"#" in either half would end the parameter early.
  it("keeps characters that would otherwise cut the post short", () => {
    const url = tweetIntentUrl("¡Tengo 1673 (Diamond & #1) de clasificación!", "https://example.com/p?ref=x");
    expect(url).toContain("%26");
    expect(url).toContain("%23");
    expect(url).toContain("%C2%A1");
    expect(url.split("?").length).toBe(2);
  });
});

describe("rankCardUrl", () => {
  it("points at the profile's own OpenGraph image", () => {
    expect(rankCardUrl("abc123")).toBe("/players/abc123/opengraph-image");
  });
});
