import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createPost } from "@/lib/free-battle";
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
    const webhookSpy = vi.spyOn(discordBot, "sendDiscordWebhookMessage").mockResolvedValue(undefined);
    const author = await createTestUser({ region: "USA West" });

    await createPost(author.id, "anyone up for some games?");

    expect(webhookSpy).not.toHaveBeenCalled();
  });

  it("posts a Discord webhook announcement when configured", async () => {
    process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL = "https://discord.com/api/webhooks/test";
    const webhookSpy = vi.spyOn(discordBot, "sendDiscordWebhookMessage").mockResolvedValue(undefined);
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
});
