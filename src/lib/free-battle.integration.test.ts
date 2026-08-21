import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { PostStatus } from "@/generated/prisma/enums";
import { createPost, closePost, claimPost } from "@/lib/free-battle";
import { finalizeExpiredFreeBattlePosts } from "@/lib/finalize";
import { createTestUser } from "@/test/factories";
import * as discordBot from "@/lib/discord-bot";

describe("createPost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL;
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
});

describe("closePost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL;
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
});

describe("finalizeExpiredFreeBattlePosts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL;
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
