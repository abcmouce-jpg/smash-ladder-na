import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/test/factories";
import { getSubscribedCharacters, toggleCharacterGuideSubscription } from "@/lib/character-guide-subscriptions";

describe("toggleCharacterGuideSubscription", () => {
  it("subscribes the whole echo group via its base fighter, then toggles back off", async () => {
    const user = await createTestUser();

    await expect(toggleCharacterGuideSubscription(user.id, "Dark Samus")).resolves.toBe(true);
    const rows = await prisma.characterGuideSubscription.findMany({ where: { userId: user.id } });
    expect(rows.map((r) => r.character)).toEqual(["Samus"]);

    // Toggling off from either half of the pair has to clear it.
    await expect(toggleCharacterGuideSubscription(user.id, "Samus")).resolves.toBe(false);
    await expect(prisma.characterGuideSubscription.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it("clears a legacy row saved against an echo member", async () => {
    const user = await createTestUser();
    await prisma.characterGuideSubscription.create({ data: { userId: user.id, character: "Daisy" } });

    await expect(toggleCharacterGuideSubscription(user.id, "Peach")).resolves.toBe(false);

    await expect(prisma.characterGuideSubscription.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it("keeps Marth and Lucina independent, despite both being echoes", async () => {
    const user = await createTestUser();

    await expect(toggleCharacterGuideSubscription(user.id, "Marth")).resolves.toBe(true);
    await expect(toggleCharacterGuideSubscription(user.id, "Lucina")).resolves.toBe(true);

    const rows = await prisma.characterGuideSubscription.findMany({
      where: { userId: user.id },
      orderBy: { character: "asc" },
    });
    expect(rows.map((r) => r.character)).toEqual(["Lucina", "Marth"]);
  });
});

describe("getSubscribedCharacters", () => {
  it("normalizes legacy per-echo rows to the group's base fighter", async () => {
    const user = await createTestUser();
    await prisma.characterGuideSubscription.createMany({
      data: [
        { userId: user.id, character: "Dark Pit" },
        { userId: user.id, character: "Mario" },
      ],
    });

    const subscribed = await getSubscribedCharacters(user.id);

    expect(subscribed.sort()).toEqual(["Mario", "Pit"]);
  });

  it("collapses a base fighter and its echo stored as separate rows into one", async () => {
    const user = await createTestUser();
    await prisma.characterGuideSubscription.createMany({
      data: [
        { userId: user.id, character: "Peach" },
        { userId: user.id, character: "Daisy" },
      ],
    });

    await expect(getSubscribedCharacters(user.id)).resolves.toEqual(["Peach"]);
  });
});
