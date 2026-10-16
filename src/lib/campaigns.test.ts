import { describe, it, expect } from "vitest";
import { SIGNUP_SOURCE_MAX_LENGTH, normalizeCampaignTag } from "@/lib/campaigns";

describe("normalizeCampaignTag", () => {
  it("keeps the shape campaign links are written in", () => {
    expect(normalizeCampaignTag("reddit-crazyhand")).toBe("reddit-crazyhand");
    expect(normalizeCampaignTag("fb_socal_smash")).toBe("fb_socal_smash");
  });

  it("case-folds so the same post isn't split across two rows", () => {
    expect(normalizeCampaignTag("Reddit-CrazyHand")).toBe("reddit-crazyhand");
  });

  it("strips anything outside the tag charset", () => {
    // The value arrives from a client-controlled cookie, so it has to survive
    // being handed arbitrary bytes without becoming a problem downstream.
    expect(normalizeCampaignTag("reddit crazyhand!")).toBe("redditcrazyhand");
    expect(normalizeCampaignTag("<script>alert(1)</script>")).toBe("scriptalert1script");
  });

  it("caps the length rather than storing whatever was sent", () => {
    const long = normalizeCampaignTag("a".repeat(500));
    expect(long).toHaveLength(SIGNUP_SOURCE_MAX_LENGTH);
  });

  it("treats missing or content-free values as no campaign at all", () => {
    expect(normalizeCampaignTag(undefined)).toBeNull();
    expect(normalizeCampaignTag(null)).toBeNull();
    expect(normalizeCampaignTag("")).toBeNull();
    // Normalizing away to nothing must read as absent, not as a tag named "".
    expect(normalizeCampaignTag("!!!")).toBeNull();
  });
});
