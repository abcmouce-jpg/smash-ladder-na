import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { setArenaPassword } from "@/lib/arena";
import { createTestUser } from "@/test/factories";

describe("setArenaPassword", () => {
  it("stores a custom password", async () => {
    const user = await createTestUser();
    await setArenaPassword(user.id, "5150");

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.arenaPassword).toBe("5150");
  });

  it("trims surrounding whitespace", async () => {
    const user = await createTestUser();
    await setArenaPassword(user.id, "  5150  ");

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.arenaPassword).toBe("5150");
  });

  it("resets back to the shared default when submitted blank", async () => {
    const user = await createTestUser({ arenaPassword: "5150" });
    await setArenaPassword(user.id, "   ");

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.arenaPassword).toBeNull();
  });

  it("rejects a password over the length limit", async () => {
    const user = await createTestUser();
    await expect(setArenaPassword(user.id, "x".repeat(21))).rejects.toThrow(/20 characters/i);
  });
});
