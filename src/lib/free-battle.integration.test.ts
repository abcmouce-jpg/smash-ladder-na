import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { MatchStatus, PostStatus } from "@/generated/prisma/enums";
import { createPost, closePost, claimPost } from "@/lib/free-battle";
import { finalizeExpiredFreeBattlePosts } from "@/lib/finalize";
import { createTestUser } from "@/test/factories";
import * as discordBot from "@/lib/discord-bot";

// Gives userId a peak rating of ratingAfter by recording it in RatingHistory
// off a throwaway confirmed match — getPeakRating (and therefore every
// tier-restriction check below) reads history, not the live User.rating, so
// this is the only way to grant "has reached tier X" in a test.
async function givePeakRating(userId: string, ratingAfter: number) {
  const opponent = await createTestUser();
  const match = await prisma.ratingMatch.create({
    data: { player1Id: userId, player2Id: opponent.id, status: MatchStatus.CONFIRMED, expiresAt: new Date() },
  });
  await prisma.ratingHistory.create({
    data: { userId, matchId: match.id, ratingBefore: 1500, ratingAfter, delta: ratingAfter - 1500 },
  });
}

describe("createPost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL;
    delete process.env.DISCORD_FREE_BATTLE_ELITE_WEBHOOK_URL;
  });

  it("creates the post using the author's own region", async () => {
    const author = await createTestUser({ region: "USA West" });

    const post = await createPost(author.id, "anyone up for some games?");

    expect(post.authorId).toBe(author.id);
    expect(post.region).toBe("USA West");
  });

  it("does not call the Discord webhook when unconfigured", async () => {
    const webhookSpy = vi.spyOn(discordBot, "sendDiscordWebhookMessage").mockResolvedValue(null);
    const author = await createTestUser({ region: "USA West" });

    await createPost(author.id, "anyone up for some games?");

    expect(webhookSpy).not.toHaveBeenCalled();
  });

  it("posts a Discord webhook announcement when configured", async () => {
    process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL = "https://discord.com/api/webhooks/test";
    const webhookSpy = vi.spyOn(discordBot, "sendDiscordWebhookMessage").mockResolvedValue(null);
    const author = await createTestUser({ region: "USA West", username: "Ganon4Life" });

    await createPost(author.id, "anyone up for some games?");

    expect(webhookSpy).toHaveBeenCalledTimes(1);
    const [url, content] = webhookSpy.mock.calls[0];
    expect(url).toBe("https://discord.com/api/webhooks/test");
    expect(content).toContain("Ganon4Life");
    expect(content).toContain("USA West");
    expect(content).toContain("anyone up for some games?");
  });

  it("rejects a second active post from the same author", async () => {
    const author = await createTestUser({ region: "USA West" });
    await createPost(author.id, "first post");

    await expect(createPost(author.id, "second post")).rejects.toThrow("You already have an active post");
  });

  it("rejects an empty comment", async () => {
    const author = await createTestUser({ region: "USA West" });

    await expect(createPost(author.id, "   ")).rejects.toThrow("Comment is required");
    const count = await prisma.freeBattlePost.count();
    expect(count).toBe(0);
  });

  it("stores the Discord message id returned by the webhook", async () => {
    process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL = "https://discord.com/api/webhooks/test";
    vi.spyOn(discordBot, "sendDiscordWebhookMessage").mockResolvedValue("msg-123");
    const author = await createTestUser({ region: "USA West" });

    const post = await createPost(author.id, "anyone up for some games?");

    const stored = await prisma.freeBattlePost.findUniqueOrThrow({ where: { id: post.id } });
    expect(stored.discordMessageId).toBe("msg-123");
  });

  it("rejects a rank restriction the author has never reached", async () => {
    const author = await createTestUser();

    await expect(createPost(author.id, "elite only", "Elite")).rejects.toThrow(
      "You need to have reached Elite at least once to post this",
    );
    expect(await prisma.freeBattlePost.count()).toBe(0);
  });

  it("allows a rank restriction once the author's peak rating cleared it", async () => {
    const author = await createTestUser();
    await givePeakRating(author.id, 1600); // Elite's floor exactly

    const post = await createPost(author.id, "elite only", "Elite");

    expect(post.minTier).toBe("Elite");
  });

  it("still allows posting after a rating dip, since it's peak-based", async () => {
    const author = await createTestUser({ rating: 1450 }); // currently back below Elite
    await givePeakRating(author.id, 1650);

    const post = await createPost(author.id, "elite only", "Elite");

    expect(post.minTier).toBe("Elite");
  });

  it("routes the announcement to that tier's own webhook, not the general one", async () => {
    process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL = "https://discord.com/api/webhooks/general";
    process.env.DISCORD_FREE_BATTLE_ELITE_WEBHOOK_URL = "https://discord.com/api/webhooks/elite";
    const webhookSpy = vi.spyOn(discordBot, "sendDiscordWebhookMessage").mockResolvedValue(null);
    const author = await createTestUser();
    await givePeakRating(author.id, 1650);

    await createPost(author.id, "elite only", "Elite");

    expect(webhookSpy).toHaveBeenCalledTimes(1);
    const [url, content] = webhookSpy.mock.calls[0];
    expect(url).toBe("https://discord.com/api/webhooks/elite");
    expect(content).toContain("Elite+");
  });
});

describe("closePost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL;
    delete process.env.DISCORD_FREE_BATTLE_ELITE_WEBHOOK_URL;
  });

  it("deletes the post's Discord announcement when one exists", async () => {
    process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL = "https://discord.com/api/webhooks/test";
    const deleteSpy = vi.spyOn(discordBot, "deleteDiscordWebhookMessage").mockResolvedValue(undefined);
    const author = await createTestUser();
    const post = await prisma.freeBattlePost.create({
      data: {
        authorId: author.id,
        comment: "test",
        expiresAt: new Date(Date.now() + 60_000),
        discordMessageId: "msg-456",
      },
    });

    await closePost(author.id, post.id);

    expect(deleteSpy).toHaveBeenCalledWith("https://discord.com/api/webhooks/test", "msg-456");
  });

  it("does nothing Discord-related when the post never had a message", async () => {
    const deleteSpy = vi.spyOn(discordBot, "deleteDiscordWebhookMessage").mockResolvedValue(undefined);
    const author = await createTestUser();
    const post = await prisma.freeBattlePost.create({
      data: { authorId: author.id, comment: "test", expiresAt: new Date(Date.now() + 60_000) },
    });

    await closePost(author.id, post.id);

    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("does not delete anything when the close itself is a no-op (wrong author)", async () => {
    const deleteSpy = vi.spyOn(discordBot, "deleteDiscordWebhookMessage").mockResolvedValue(undefined);
    const author = await createTestUser();
    const other = await createTestUser();
    const post = await prisma.freeBattlePost.create({
      data: {
        authorId: author.id,
        comment: "test",
        expiresAt: new Date(Date.now() + 60_000),
        discordMessageId: "msg-789",
      },
    });

    await closePost(other.id, post.id);

    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

describe("claimPost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL;
    delete process.env.DISCORD_FREE_BATTLE_ELITE_WEBHOOK_URL;
  });

  it("deletes the post's Discord announcement on a successful claim", async () => {
    process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL = "https://discord.com/api/webhooks/test";
    const deleteSpy = vi.spyOn(discordBot, "deleteDiscordWebhookMessage").mockResolvedValue(undefined);
    vi.spyOn(discordBot, "sendDiscordDM").mockResolvedValue(undefined);
    const author = await createTestUser();
    const claimer = await createTestUser();
    const post = await prisma.freeBattlePost.create({
      data: {
        authorId: author.id,
        comment: "test",
        expiresAt: new Date(Date.now() + 60_000),
        discordMessageId: "msg-999",
      },
    });

    await claimPost(claimer.id, post.id);

    expect(deleteSpy).toHaveBeenCalledWith("https://discord.com/api/webhooks/test", "msg-999");
  });

  it("rejects a claimer who hasn't reached the post's required rank", async () => {
    const author = await createTestUser();
    await givePeakRating(author.id, 1650);
    const post = await createPost(author.id, "elite only", "Elite");
    const claimer = await createTestUser();

    await expect(claimPost(claimer.id, post.id)).rejects.toThrow(
      "You need to have reached Elite at least once to post this",
    );
    const stored = await prisma.freeBattlePost.findUniqueOrThrow({ where: { id: post.id } });
    expect(stored.status).toBe(PostStatus.OPEN);
  });

  it("allows a claimer who has reached the post's required rank", async () => {
    const author = await createTestUser();
    await givePeakRating(author.id, 1650);
    const post = await createPost(author.id, "elite only", "Elite");
    const claimer = await createTestUser();
    await givePeakRating(claimer.id, 1620);

    await claimPost(claimer.id, post.id);

    const stored = await prisma.freeBattlePost.findUniqueOrThrow({ where: { id: post.id } });
    expect(stored.status).toBe(PostStatus.MATCHED);
    expect(stored.matchedWithId).toBe(claimer.id);
  });

  it("deletes a tier-restricted post's announcement via that tier's webhook", async () => {
    process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL = "https://discord.com/api/webhooks/general";
    process.env.DISCORD_FREE_BATTLE_ELITE_WEBHOOK_URL = "https://discord.com/api/webhooks/elite";
    vi.spyOn(discordBot, "sendDiscordWebhookMessage").mockResolvedValue("msg-elite");
    const deleteSpy = vi.spyOn(discordBot, "deleteDiscordWebhookMessage").mockResolvedValue(undefined);
    vi.spyOn(discordBot, "sendDiscordDM").mockResolvedValue(undefined);
    const author = await createTestUser();
    await givePeakRating(author.id, 1650);
    const post = await createPost(author.id, "elite only", "Elite");
    const claimer = await createTestUser();
    await givePeakRating(claimer.id, 1620);

    await claimPost(claimer.id, post.id);

    expect(deleteSpy).toHaveBeenCalledWith("https://discord.com/api/webhooks/elite", "msg-elite");
  });
});

describe("finalizeExpiredFreeBattlePosts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL;
    delete process.env.DISCORD_FREE_BATTLE_ELITE_WEBHOOK_URL;
  });

  it("deletes the Discord announcement for each post it expires", async () => {
    process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL = "https://discord.com/api/webhooks/test";
    const deleteSpy = vi.spyOn(discordBot, "deleteDiscordWebhookMessage").mockResolvedValue(undefined);
    const author = await createTestUser();
    const expired = await prisma.freeBattlePost.create({
      data: {
        authorId: author.id,
        comment: "test",
        expiresAt: new Date(Date.now() - 60_000),
        discordMessageId: "msg-expired",
      },
    });

    const count = await finalizeExpiredFreeBattlePosts();

    expect(count).toBe(1);
    expect(deleteSpy).toHaveBeenCalledWith("https://discord.com/api/webhooks/test", "msg-expired");
    const updated = await prisma.freeBattlePost.findUniqueOrThrow({ where: { id: expired.id } });
    expect(updated.status).toBe(PostStatus.EXPIRED);
  });

  it("skips posts with no Discord announcement without erroring", async () => {
    const deleteSpy = vi.spyOn(discordBot, "deleteDiscordWebhookMessage").mockResolvedValue(undefined);
    const author = await createTestUser();
    await prisma.freeBattlePost.create({
      data: { authorId: author.id, comment: "test", expiresAt: new Date(Date.now() - 60_000) },
    });

    const count = await finalizeExpiredFreeBattlePosts();

    expect(count).toBe(1);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
