import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeTierChange } from "./rank-roles";

describe("computeTierChange", () => {
  it("detects a tier change across a match", () => {
    const change = computeTierChange("u1", "d1", "Player", 1740, 1760, 20);
    expect(change.oldTier).toBe("Elite");
    expect(change.newTier).toBe("Master");
  });

  it("reports no change when staying in the same tier", () => {
    const change = computeTierChange("u1", "d1", "Player", 1500, 1550, 20);
    expect(change.oldTier).toBe("Fighter");
    expect(change.newTier).toBe("Fighter");
  });

  it("reports a tier drop the same way as a tier up — the caller decides what to do with direction", () => {
    const change = computeTierChange("u1", "d1", "Player", 1760, 1740, 20);
    expect(change.oldTier).toBe("Master");
    expect(change.newTier).toBe("Elite");
  });

  it("uses the pre-increment games count for oldTier so a provisional reveal is detected", () => {
    // 9 games before this match (still provisional) -> 10 after (tiered for the first time).
    const change = computeTierChange("u1", "d1", "Player", 1550, 1560, 9);
    expect(change.oldTier).toBeNull();
    expect(change.newTier).toBe("Fighter");
  });

  it("stays provisional on both sides when still under the games threshold after this match", () => {
    const change = computeTierChange("u1", "d1", "Player", 1550, 1600, 5);
    expect(change.oldTier).toBeNull();
    expect(change.newTier).toBeNull();
  });
});

vi.mock("@/lib/discord-bot", () => ({
  syncDiscordGuildMemberRole: vi.fn(),
  sendDiscordWebhookEmbed: vi.fn(),
}));

describe("applyTierChange", () => {
  beforeEach(() => {
    process.env.DISCORD_COMMUNITY_GUILD_ID = "guild1";
    process.env.DISCORD_TIER_ROLE_IDS = JSON.stringify({ Challenger: "role-challenger", Fighter: "role-fighter" });
    process.env.DISCORD_TIER_UP_WEBHOOK_URL = "https://discord.test/webhook";
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.DISCORD_COMMUNITY_GUILD_ID;
    delete process.env.DISCORD_TIER_ROLE_IDS;
    delete process.env.DISCORD_TIER_UP_WEBHOOK_URL;
  });

  it("does not announce reaching Challenger — it's the provisional reveal, not an achievement", async () => {
    const { applyTierChange } = await import("./rank-roles");
    const { syncDiscordGuildMemberRole, sendDiscordWebhookEmbed } = await import("@/lib/discord-bot");

    await applyTierChange({ userId: "u1", discordId: "d1", username: "Player", oldTier: null, newTier: "Challenger" });

    expect(syncDiscordGuildMemberRole).toHaveBeenCalledWith("guild1", "d1", "role-challenger", null);
    expect(sendDiscordWebhookEmbed).not.toHaveBeenCalled();
  });

  it("announces a genuine tier-up past Challenger", async () => {
    const { applyTierChange } = await import("./rank-roles");
    const { sendDiscordWebhookEmbed } = await import("@/lib/discord-bot");

    await applyTierChange({ userId: "u1", discordId: "d1", username: "Player", oldTier: null, newTier: "Fighter" });

    expect(sendDiscordWebhookEmbed).toHaveBeenCalledTimes(1);
  });
});
