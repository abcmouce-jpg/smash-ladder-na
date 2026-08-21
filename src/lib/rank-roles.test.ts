import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeTierChange } from "./rank-roles";

describe("computeTierChange", () => {
  it("detects a tier change across a match", () => {
    const change = computeTierChange("u1", "d1", "Player", "m1", 1740, 1760, 20);
    expect(change.oldTier).toBe("Elite");
    expect(change.newTier).toBe("Master");
  });

  it("reports no change when staying in the same tier", () => {
    const change = computeTierChange("u1", "d1", "Player", "m1", 1500, 1550, 20);
    expect(change.oldTier).toBe("Fighter");
    expect(change.newTier).toBe("Fighter");
  });

  it("reports a tier drop the same way as a tier up — the caller decides what to do with direction", () => {
    const change = computeTierChange("u1", "d1", "Player", "m1", 1760, 1740, 20);
    expect(change.oldTier).toBe("Master");
    expect(change.newTier).toBe("Elite");
  });

  it("uses the pre-increment games count for oldTier so a provisional reveal is detected", () => {
    // 9 games before this match (still provisional) -> 10 after (tiered for the first time).
    const change = computeTierChange("u1", "d1", "Player", "m1", 1550, 1560, 9);
    expect(change.oldTier).toBeNull();
    expect(change.newTier).toBe("Fighter");
  });

  it("stays provisional on both sides when still under the games threshold after this match", () => {
    const change = computeTierChange("u1", "d1", "Player", "m1", 1550, 1600, 5);
    expect(change.oldTier).toBeNull();
    expect(change.newTier).toBeNull();
  });
});

vi.mock("@/lib/discord-bot", () => ({
  syncDiscordGuildMemberRole: vi.fn(),
  sendDiscordWebhookEmbed: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    ratingHistory: {
      aggregate: vi.fn().mockResolvedValue({ _max: { ratingAfter: null } }),
    },
  },
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

    await applyTierChange({
      userId: "u1",
      discordId: "d1",
      username: "Player",
      matchId: "m1",
      oldTier: null,
      newTier: "Challenger",
    });

    expect(syncDiscordGuildMemberRole).toHaveBeenCalledWith("guild1", "d1", "role-challenger", null);
    expect(sendDiscordWebhookEmbed).not.toHaveBeenCalled();
  });

  it("announces a genuine first-time tier-up past Challenger", async () => {
    const { applyTierChange } = await import("./rank-roles");
    const { sendDiscordWebhookEmbed } = await import("@/lib/discord-bot");

    await applyTierChange({
      userId: "u1",
      discordId: "d1",
      username: "Player",
      matchId: "m1",
      oldTier: null,
      newTier: "Fighter",
    });

    expect(sendDiscordWebhookEmbed).toHaveBeenCalledTimes(1);
  });

  it("still syncs the Discord role when climbing back to a tier already reached before, but doesn't announce it", async () => {
    const { prisma } = await import("@/lib/db");
    // Peak rating from an earlier match already clears Master's floor (1750) —
    // this "tier-up" is really just a climb back up after a dip.
    vi.mocked(prisma.ratingHistory.aggregate).mockResolvedValueOnce({ _max: { ratingAfter: 1800 } } as never);

    const { applyTierChange } = await import("./rank-roles");
    const { syncDiscordGuildMemberRole, sendDiscordWebhookEmbed } = await import("@/lib/discord-bot");

    await applyTierChange({
      userId: "u1",
      discordId: "d1",
      username: "Player",
      matchId: "m2",
      oldTier: "Elite",
      newTier: "Master",
    });

    expect(syncDiscordGuildMemberRole).toHaveBeenCalledTimes(1);
    expect(sendDiscordWebhookEmbed).not.toHaveBeenCalled();
  });

  it("adds the landing tier's role on a rank-down without ever removing the old one — tier roles are permanent badges", async () => {
    process.env.DISCORD_TIER_ROLE_IDS = JSON.stringify({ Elite: "role-elite", Master: "role-master" });
    const { applyTierChange } = await import("./rank-roles");
    const { syncDiscordGuildMemberRole, sendDiscordWebhookEmbed } = await import("@/lib/discord-bot");

    await applyTierChange({
      userId: "u1",
      discordId: "d1",
      username: "Player",
      matchId: "m3",
      oldTier: "Master",
      newTier: "Elite", // a losing streak dropped them back down
    });

    // Only ever adds the tier just landed on (a harmless no-op here, since
    // they'd already have Elite's role from climbing through it earlier) —
    // never passes a removeRoleId for the tier they dropped out of.
    expect(syncDiscordGuildMemberRole).toHaveBeenCalledWith("guild1", "d1", "role-elite", null);
    expect(syncDiscordGuildMemberRole).toHaveBeenCalledTimes(1);
    expect(sendDiscordWebhookEmbed).not.toHaveBeenCalled();
  });

  it("announces a new personal-best tier even if a lower tier was reached before", async () => {
    const { prisma } = await import("@/lib/db");
    // Past peak only clears Elite's floor (1600), not Master's (1750) — this
    // Master reach is a genuine new peak.
    vi.mocked(prisma.ratingHistory.aggregate).mockResolvedValueOnce({ _max: { ratingAfter: 1650 } } as never);

    const { applyTierChange } = await import("./rank-roles");
    const { sendDiscordWebhookEmbed } = await import("@/lib/discord-bot");

    await applyTierChange({
      userId: "u1",
      discordId: "d1",
      username: "Player",
      matchId: "m2",
      oldTier: "Elite",
      newTier: "Master",
    });

    expect(sendDiscordWebhookEmbed).toHaveBeenCalledTimes(1);
  });
});
