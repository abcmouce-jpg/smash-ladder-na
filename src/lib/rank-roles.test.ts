import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeTierChange } from "./rank-roles";

describe("computeTierChange", () => {
  it("detects a tier change across a match", () => {
    const change = computeTierChange("u1", "d1", "Player", "m1", 1780, 1820, 20);
    expect(change.oldTier).toBe("Elite");
    expect(change.newTier).toBe("Master");
  });

  it("reports no change when staying in the same tier", () => {
    const change = computeTierChange("u1", "d1", "Player", "m1", 1500, 1550, 20);
    expect(change.oldTier).toBe("Fighter");
    expect(change.newTier).toBe("Fighter");
  });

  it("reports a tier drop the same way as a tier up — the caller decides what to do with direction", () => {
    const change = computeTierChange("u1", "d1", "Player", "m1", 1820, 1780, 20);
    expect(change.oldTier).toBe("Master");
    expect(change.newTier).toBe("Elite");
  });

  it("uses the pre-increment games count for oldTier so a provisional reveal is detected", () => {
    // 4 games before this match (still provisional) -> 5 after (tiered for the first time).
    const change = computeTierChange("u1", "d1", "Player", "m1", 1550, 1560, 4);
    expect(change.oldTier).toBeNull();
    expect(change.newTier).toBe("Fighter");
  });

  it("stays provisional on both sides when still under the games threshold after this match", () => {
    const change = computeTierChange("u1", "d1", "Player", "m1", 1550, 1600, 2);
    expect(change.oldTier).toBeNull();
    expect(change.newTier).toBeNull();
  });
});

vi.mock("@/lib/discord-bot", () => ({
  syncDiscordGuildMemberRoles: vi.fn(),
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
    process.env.DISCORD_TIER_ROLE_IDS = JSON.stringify({ Trainee: "role-trainee", Fighter: "role-fighter" });
    process.env.DISCORD_TIER_UP_WEBHOOK_URL = "https://discord.test/webhook";
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.DISCORD_COMMUNITY_GUILD_ID;
    delete process.env.DISCORD_TIER_ROLE_IDS;
    delete process.env.DISCORD_TIER_UP_WEBHOOK_URL;
  });

  it("does not announce reaching Trainee — it's the provisional reveal, not an achievement", async () => {
    const { applyTierChange } = await import("./rank-roles");
    const { syncDiscordGuildMemberRoles, sendDiscordWebhookEmbed } = await import("@/lib/discord-bot");

    await applyTierChange({
      userId: "u1",
      discordId: "d1",
      username: "Player",
      matchId: "m1",
      oldTier: null,
      newTier: "Trainee",
    });

    expect(syncDiscordGuildMemberRoles).toHaveBeenCalledWith("guild1", "d1", ["role-trainee"], ["role-fighter"]);
    expect(sendDiscordWebhookEmbed).not.toHaveBeenCalled();
  });

  it("announces a genuine first-time tier-up past Trainee", async () => {
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
    // Peak rating from an earlier match already clears Master's floor (1800) —
    // this "tier-up" is really just a climb back up after a dip.
    vi.mocked(prisma.ratingHistory.aggregate).mockResolvedValueOnce({ _max: { ratingAfter: 1800 } } as never);

    const { applyTierChange } = await import("./rank-roles");
    const { syncDiscordGuildMemberRoles, sendDiscordWebhookEmbed } = await import("@/lib/discord-bot");

    await applyTierChange({
      userId: "u1",
      discordId: "d1",
      username: "Player",
      matchId: "m2",
      oldTier: "Elite",
      newTier: "Master",
    });

    expect(syncDiscordGuildMemberRoles).toHaveBeenCalledTimes(1);
    expect(sendDiscordWebhookEmbed).not.toHaveBeenCalled();
  });

  it("moves the member to the landing tier's role on a rank-down, stripping the tier they left", async () => {
    process.env.DISCORD_TIER_ROLE_IDS = JSON.stringify({ Elite: "role-elite", Master: "role-master" });
    const { applyTierChange } = await import("./rank-roles");
    const { syncDiscordGuildMemberRoles, sendDiscordWebhookEmbed } = await import("@/lib/discord-bot");

    await applyTierChange({
      userId: "u1",
      discordId: "d1",
      username: "Player",
      matchId: "m3",
      oldTier: "Master",
      newTier: "Elite", // a losing streak dropped them back down
    });

    // Exactly one tier role at a time: grant Elite, strip Master. Stated as a
    // full end state (not a delta), so a member still carrying the higher role
    // from before gets cleaned up rather than accumulating it.
    expect(syncDiscordGuildMemberRoles).toHaveBeenCalledWith("guild1", "d1", ["role-elite"], ["role-master"]);
    expect(syncDiscordGuildMemberRoles).toHaveBeenCalledTimes(1);
    expect(sendDiscordWebhookEmbed).not.toHaveBeenCalled();
  });

  it("strips every other tier role, so roles can't accumulate across tier changes", async () => {
    process.env.DISCORD_TIER_ROLE_IDS = JSON.stringify({
      Grandmaster: "role-grandmaster",
      Master: "role-master",
      Elite: "role-elite",
    });
    const { applyTierChange } = await import("./rank-roles");
    const { syncDiscordGuildMemberRoles } = await import("@/lib/discord-bot");

    await applyTierChange({
      userId: "u1",
      discordId: "d1",
      username: "Player",
      matchId: "m4",
      oldTier: "Elite",
      newTier: "Master",
    });

    expect(syncDiscordGuildMemberRoles).toHaveBeenCalledWith(
      "guild1",
      "d1",
      ["role-master"],
      ["role-grandmaster", "role-elite"],
    );
  });

  it("announces a new personal-best tier even if a lower tier was reached before", async () => {
    const { prisma } = await import("@/lib/db");
    // Past peak only clears Elite's floor (1600), not Master's (1800) — this
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
