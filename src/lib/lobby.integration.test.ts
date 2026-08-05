import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createDirectMatch, getActiveLobbyEntry, joinLobbyAndTryPair } from "@/lib/lobby";
import { blockUser } from "@/lib/blocks";
import { PairingMethod } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

async function createPastMatch(p1: string, p2: string, createdAt: Date) {
  return prisma.ratingMatch.create({
    data: {
      player1Id: p1,
      player2Id: p2,
      status: "CONFIRMED",
      createdAt,
      expiresAt: createdAt,
    },
  });
}

describe("joinLobbyAndTryPair", () => {
  it("rejects joining while a timeout cooldown is still active", async () => {
    const a = await createTestUser({
      region: "USA East",
      queueCooldownUntil: new Date(Date.now() + 5 * 60 * 1000),
    });

    await expect(joinLobbyAndTryPair(a.id)).rejects.toThrow(/timed out/i);

    const entries = await prisma.ratingLobbyEntry.count({ where: { userId: a.id } });
    expect(entries).toBe(0);
  });

  it("allows joining once the timeout cooldown has passed", async () => {
    const a = await createTestUser({
      region: "USA East",
      queueCooldownUntil: new Date(Date.now() - 1000),
    });

    const entry = await joinLobbyAndTryPair(a.id);
    expect(entry?.status).toBe("WAITING");
  });

  it("pairs two compatible waiting players", async () => {
    const a = await createTestUser({ region: "USA East" });
    const b = await createTestUser({ region: "USA East" });

    const first = await joinLobbyAndTryPair(a.id);
    expect(first?.status).toBe("WAITING");

    const second = await joinLobbyAndTryPair(b.id);
    expect(second?.status).toBe("PAIRED");

    const match = await prisma.ratingMatch.findFirst({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match).not.toBeNull();
    expect(match?.status).toBe("PENDING_REPORT");
    expect([match?.player1Id, match?.player2Id].sort()).toEqual([a.id, b.id].sort());
  });

  it("does not pair players whose rating gap tolerance excludes each other", async () => {
    const a = await createTestUser({ region: "USA East", rating: 1500, maxRatingGap: 50 });
    const b = await createTestUser({ region: "USA East", rating: 1800 });

    await joinLobbyAndTryPair(a.id);
    await joinLobbyAndTryPair(b.id);

    const match = await prisma.ratingMatch.findFirst({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match).toBeNull();

    const entries = await prisma.ratingLobbyEntry.findMany({ where: { userId: { in: [a.id, b.id] } } });
    expect(entries.every((e) => e.status === "WAITING")).toBe(true);
  });

  it("caps a provisional player's effective rating gap even with maxRatingGap left at 'any'", async () => {
    // Both default to maxRatingGap: null ("any rating"), but b is provisional
    // (gamesPlayed < PROVISIONAL_GAMES_THRESHOLD) — should still be blocked
    // from a 500-point gap despite neither explicitly restricting it.
    const a = await createTestUser({ region: "USA East", rating: 1500, gamesPlayed: 50 });
    const b = await createTestUser({ region: "USA East", rating: 2000, gamesPlayed: 2 });

    await joinLobbyAndTryPair(a.id);
    await joinLobbyAndTryPair(b.id);

    const match = await prisma.ratingMatch.findFirst({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match).toBeNull();
  });

  it("still pairs a provisional player within the provisional rating-gap cap", async () => {
    const a = await createTestUser({ region: "USA East", rating: 1500, gamesPlayed: 50 });
    const b = await createTestUser({ region: "USA East", rating: 1700, gamesPlayed: 2 });

    await joinLobbyAndTryPair(a.id);
    const result = await joinLobbyAndTryPair(b.id);

    expect(result).not.toBeNull();
    const match = await prisma.ratingMatch.findFirst({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match).not.toBeNull();
  });

  it("does not cap two non-provisional players' 'any rating' gap", async () => {
    const a = await createTestUser({ region: "USA East", rating: 1500, gamesPlayed: 50 });
    const b = await createTestUser({ region: "USA East", rating: 2000, gamesPlayed: 30 });

    await joinLobbyAndTryPair(a.id);
    await joinLobbyAndTryPair(b.id);

    const match = await prisma.ratingMatch.findFirst({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match).not.toBeNull();
  });

  it("does not pair players when either side has blocked the other", async () => {
    const a = await createTestUser({ region: "USA East" });
    const b = await createTestUser({ region: "USA East" });
    await blockUser(b.id, a.id); // b blocked a — should block pairing regardless of who queues first

    await joinLobbyAndTryPair(a.id);
    await joinLobbyAndTryPair(b.id);

    const match = await prisma.ratingMatch.findFirst({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match).toBeNull();

    const entries = await prisma.ratingLobbyEntry.findMany({ where: { userId: { in: [a.id, b.id] } } });
    expect(entries.every((e) => e.status === "WAITING")).toBe(true);
  });

  it("does not pair players who played within either side's rematch cooldown", async () => {
    const a = await createTestUser({ region: "USA East", rematchCooldownHours: 24 });
    const b = await createTestUser({ region: "USA East" });
    await createPastMatch(a.id, b.id, new Date(Date.now() - 60 * 60 * 1000)); // 1h ago

    await joinLobbyAndTryPair(a.id);
    await joinLobbyAndTryPair(b.id);

    const newMatch = await prisma.ratingMatch.findFirst({
      where: { player1Id: { in: [a.id, b.id] }, player2Id: { in: [a.id, b.id] }, status: "PENDING_REPORT" },
    });
    expect(newMatch).toBeNull();

    const entries = await prisma.ratingLobbyEntry.findMany({ where: { userId: { in: [a.id, b.id] } } });
    expect(entries.every((e) => e.status === "WAITING")).toBe(true);
  });

  it("pairs players again once their rematch cooldown has elapsed", async () => {
    const a = await createTestUser({ region: "USA East", rematchCooldownHours: 12 });
    const b = await createTestUser({ region: "USA East" });
    await createPastMatch(a.id, b.id, new Date(Date.now() - 13 * 60 * 60 * 1000)); // 13h ago

    await joinLobbyAndTryPair(a.id);
    const second = await joinLobbyAndTryPair(b.id);

    expect(second?.status).toBe("PAIRED");
  });

  it("does not pair when one side requires a wired opponent and the other isn't wired", async () => {
    const a = await createTestUser({ region: "USA East", requireWiredOpponent: true });
    const b = await createTestUser({ region: "USA East", wiredConnection: false });

    await joinLobbyAndTryPair(a.id);
    await joinLobbyAndTryPair(b.id);

    const match = await prisma.ratingMatch.findFirst({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match).toBeNull();
  });

  it("pairs when the wired requirement is satisfied", async () => {
    const a = await createTestUser({ region: "USA East", requireWiredOpponent: true });
    const b = await createTestUser({ region: "USA East", wiredConnection: true });

    await joinLobbyAndTryPair(a.id);
    const second = await joinLobbyAndTryPair(b.id);

    expect(second?.status).toBe("PAIRED");
  });

  it("requires a region to be set before joining", async () => {
    const noRegion = await createTestUser({ region: null });
    await expect(joinLobbyAndTryPair(noRegion.id)).rejects.toThrow(/region/i);
  });

  it("carries each side's isPracticing flag onto the created match", async () => {
    const a = await createTestUser({ region: "USA East" });
    const b = await createTestUser({ region: "USA East" });

    await joinLobbyAndTryPair(a.id, true); // a is practicing
    await joinLobbyAndTryPair(b.id, false); // b is not

    const match = await prisma.ratingMatch.findFirstOrThrow({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    const aIsPracticing = match.player1Id === a.id ? match.player1IsPracticing : match.player2IsPracticing;
    const bIsPracticing = match.player1Id === b.id ? match.player1IsPracticing : match.player2IsPracticing;
    expect(aIsPracticing).toBe(true);
    expect(bIsPracticing).toBe(false);
  });

  it("does not pair a practicing player with someone who opted to avoid them", async () => {
    const practicing = await createTestUser({ region: "USA East" });
    const avoider = await createTestUser({ region: "USA East", avoidPracticeOpponents: true });

    await joinLobbyAndTryPair(practicing.id, true);
    await joinLobbyAndTryPair(avoider.id, false);

    const match = await prisma.ratingMatch.findFirst({
      where: { OR: [{ player1Id: practicing.id }, { player2Id: practicing.id }] },
    });
    expect(match).toBeNull();
  });

  it("pairs a practicing player with someone who hasn't opted to avoid them", async () => {
    const practicing = await createTestUser({ region: "USA East" });
    const notAvoiding = await createTestUser({ region: "USA East", avoidPracticeOpponents: false });

    await joinLobbyAndTryPair(practicing.id, true);
    const second = await joinLobbyAndTryPair(notAvoiding.id, false);

    expect(second?.status).toBe("PAIRED");
  });
});

describe("createDirectMatch", () => {
  it("creates a match discoverable via getActiveLobbyEntry for both players", async () => {
    const a = await createTestUser();
    const b = await createTestUser();

    const match = await prisma.$transaction((tx) => createDirectMatch(tx, a.id, b.id, PairingMethod.REMATCH));

    expect(match.player1Id).toBe(a.id);
    expect(match.player2Id).toBe(b.id);
    expect(match.pairingMethod).toBe(PairingMethod.REMATCH);
    expect(match.status).toBe("PENDING_REPORT");

    const entryA = await getActiveLobbyEntry(a.id);
    const entryB = await getActiveLobbyEntry(b.id);
    expect(entryA?.match?.id).toBe(match.id);
    expect(entryB?.match?.id).toBe(match.id);
  });

  it("defaults to non-practice for both sides when not specified", async () => {
    const a = await createTestUser();
    const b = await createTestUser();

    const match = await prisma.$transaction((tx) => createDirectMatch(tx, a.id, b.id, PairingMethod.REMATCH));

    expect(match.player1IsPracticing).toBe(false);
    expect(match.player2IsPracticing).toBe(false);
  });

  it("carries through each side's practicing flag when given", async () => {
    const a = await createTestUser();
    const b = await createTestUser();

    const match = await prisma.$transaction((tx) =>
      createDirectMatch(tx, a.id, b.id, PairingMethod.REMATCH, true, false),
    );

    expect(match.player1IsPracticing).toBe(true);
    expect(match.player2IsPracticing).toBe(false);
  });
});
