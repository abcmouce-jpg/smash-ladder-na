import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { PostStatus } from "@/generated/prisma/enums";
import { getFriendliesPosts } from "@/lib/home-feed";
import { createTestUser } from "@/test/factories";

const past = new Date(Date.now() - 60_000);
const future = new Date(Date.now() + 60_000);

describe("getFriendliesPosts", () => {
  it("returns open posts newest first", async () => {
    const author = await createTestUser();
    await prisma.freeBattlePost.create({
      data: {
        authorId: author.id,
        comment: "older",
        createdAt: new Date(Date.now() - 60_000),
        expiresAt: future,
      },
    });
    await prisma.freeBattlePost.create({
      data: { authorId: author.id, comment: "newer", expiresAt: future },
    });

    const posts = await getFriendliesPosts();

    expect(posts.map((p) => p.comment)).toEqual(["newer", "older"]);
  });

  // Status only flips to EXPIRED when the cron finalizer sweeps, so the home
  // page must not rely on it alone — otherwise a lapsed post keeps showing
  // until the next run.
  it("excludes a post whose TTL has lapsed but the finalizer hasn't run yet", async () => {
    const author = await createTestUser();
    await prisma.freeBattlePost.create({
      data: { authorId: author.id, comment: "lapsed", status: PostStatus.OPEN, expiresAt: past },
    });

    expect(await getFriendliesPosts()).toEqual([]);
  });

  it("excludes posts that are no longer open", async () => {
    const author = await createTestUser();
    await prisma.freeBattlePost.create({
      data: { authorId: author.id, comment: "closed", status: PostStatus.CLOSED, expiresAt: future },
    });

    expect(await getFriendliesPosts()).toEqual([]);
  });
});
