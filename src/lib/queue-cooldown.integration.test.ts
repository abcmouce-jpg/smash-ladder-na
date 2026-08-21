import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { clearQueueCooldown, listActiveCooldowns } from "@/lib/queue-cooldown";
import { createTestUser } from "@/test/factories";

describe("listActiveCooldowns", () => {
  it("only returns players whose cooldown hasn't expired yet, longest-remaining first", async () => {
    const expired = await createTestUser({
      queueCooldownUntil: new Date(Date.now() - 60 * 1000),
      recentTimeoutCount: 1,
    });
    const soon = await createTestUser({
      queueCooldownUntil: new Date(Date.now() + 5 * 60 * 1000),
      recentTimeoutCount: 1,
      noShowCount: 3,
    });
    const later = await createTestUser({
      queueCooldownUntil: new Date(Date.now() + 20 * 60 * 1000),
      recentTimeoutCount: 4,
      noShowCount: 4,
    });
    const never = await createTestUser();

    const active = await listActiveCooldowns();
    const activeIds = active.map((c) => c.id);

    expect(activeIds).not.toContain(expired.id);
    expect(activeIds).not.toContain(never.id);
    expect(activeIds).toEqual([later.id, soon.id]);

    const soonEntry = active.find((c) => c.id === soon.id);
    expect(soonEntry?.recentTimeoutCount).toBe(1);
    expect(soonEntry?.noShowCount).toBe(3);
  });
});

describe("clearQueueCooldown", () => {
  it("waives the active cooldown but leaves the escalation history untouched", async () => {
    const user = await createTestUser({
      queueCooldownUntil: new Date(Date.now() + 25 * 60 * 1000),
      recentTimeoutCount: 5,
      noShowCount: 5,
    });

    await clearQueueCooldown(user.id);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.queueCooldownUntil).toBeNull();
    expect(updated.recentTimeoutCount).toBe(5);
    expect(updated.noShowCount).toBe(5);
  });
});
