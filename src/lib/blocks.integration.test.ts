import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { blockUser, MAX_BLOCKS_PER_USER } from "@/lib/blocks";
import { createTestUser } from "@/test/factories";

describe("blockUser", () => {
  it("rejects blocking yourself", async () => {
    const a = await createTestUser();
    await expect(blockUser(a.id, a.id)).rejects.toThrow(/yourself/i);
  });

  it("is a no-op when the block already exists, even at the cap", async () => {
    const blocker = await createTestUser();
    const others = await Promise.all(
      Array.from({ length: MAX_BLOCKS_PER_USER }, () => createTestUser()),
    );
    for (const other of others) {
      await blockUser(blocker.id, other.id);
    }

    await expect(blockUser(blocker.id, others[0].id)).resolves.toBeUndefined();
    const count = await prisma.block.count({ where: { blockerId: blocker.id } });
    expect(count).toBe(MAX_BLOCKS_PER_USER);
  });

  it(`rejects a new block past ${MAX_BLOCKS_PER_USER}`, async () => {
    const blocker = await createTestUser();
    const others = await Promise.all(
      Array.from({ length: MAX_BLOCKS_PER_USER + 1 }, () => createTestUser()),
    );
    for (const other of others.slice(0, MAX_BLOCKS_PER_USER)) {
      await blockUser(blocker.id, other.id);
    }

    await expect(blockUser(blocker.id, others[MAX_BLOCKS_PER_USER].id)).rejects.toThrow(
      /only block up to/i,
    );
  });

  it("doesn't count a block against a deleted account toward the cap", async () => {
    const blocker = await createTestUser();
    const deleted = await createTestUser({ discordId: "deleted-someoldid" });
    const others = await Promise.all(
      Array.from({ length: MAX_BLOCKS_PER_USER }, () => createTestUser()),
    );
    await blockUser(blocker.id, deleted.id);
    for (const other of others) {
      await blockUser(blocker.id, other.id);
    }

    const total = await prisma.block.count({ where: { blockerId: blocker.id } });
    expect(total).toBe(MAX_BLOCKS_PER_USER + 1);
  });
});
