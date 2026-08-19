import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createDirectMatch,
  getActiveLobbyEntry,
  joinLobbyAndTryPair,
  retryPairForWaitingUser,
  setMatchRoomCode,
  sweepLobbyPairing,
} from "@/lib/lobby";
import { LobbyEntryStatus } from "@/generated/prisma/enums";
import { getRoomHostId } from "@/lib/matches";
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

  it("rejects a malformed existing room code", async () => {
    const a = await createTestUser({ region: "USA East" });
    await expect(joinLobbyAndTryPair(a.id, false, "abc")).rejects.toThrow(/room code/i);
  });

  it("makes the waiting candidate host when only they have an existing room code", async () => {
    const a = await createTestUser({ region: "USA East" });
    const b = await createTestUser({ region: "USA East" });

    await joinLobbyAndTryPair(a.id, false, "AB123");
    await joinLobbyAndTryPair(b.id, false, null);

    const match = await prisma.ratingMatch.findFirstOrThrow({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match.roomCode).toBe("AB123");
    expect(match.roomCodeSetById).toBe(a.id);
  });

  it("makes the joining player host when only they have an existing room code", async () => {
    const a = await createTestUser({ region: "USA East" });
    const b = await createTestUser({ region: "USA East" });

    await joinLobbyAndTryPair(a.id, false, null);
    await joinLobbyAndTryPair(b.id, false, "CD456");

    const match = await prisma.ratingMatch.findFirstOrThrow({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match.roomCode).toBe("CD456");
    expect(match.roomCodeSetById).toBe(b.id);
  });

  it("leaves the room code unset when both sides have an existing one", async () => {
    const a = await createTestUser({ region: "USA East" });
    const b = await createTestUser({ region: "USA East" });

    await joinLobbyAndTryPair(a.id, false, "AB123");
    await joinLobbyAndTryPair(b.id, false, "CD456");

    const match = await prisma.ratingMatch.findFirstOrThrow({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match.roomCode).toBeNull();
    expect(match.roomCodeSetById).toBeNull();
  });
});

describe("retryPairForWaitingUser", () => {
  it("pairs two already-waiting users who missed each other at their own join time", async () => {
    const a = await createTestUser({ region: "USA East" });
    const b = await createTestUser({ region: "USA East" });

    // Direct inserts bypass joinLobbyAndTryPair's own attemptPairing call —
    // simulates two joins that didn't overlap live (e.g. seconds apart with
    // no one polling in between), which previously only got caught by the
    // 5-minute sweepLobbyPairing cron.
    await prisma.ratingLobbyEntry.create({
      data: { userId: a.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });
    await prisma.ratingLobbyEntry.create({
      data: { userId: b.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });

    await retryPairForWaitingUser(a.id);

    const entryA = await getActiveLobbyEntry(a.id);
    const entryB = await getActiveLobbyEntry(b.id);
    expect(entryA?.status).toBe("PAIRED");
    expect(entryB?.status).toBe("PAIRED");
    expect(entryA?.match?.id).toBe(entryB?.match?.id);
  });

  it("is a no-op for a user who isn't waiting", async () => {
    const a = await createTestUser({ region: "USA East" });
    await expect(retryPairForWaitingUser(a.id)).resolves.toBeUndefined();
    const entries = await prisma.ratingLobbyEntry.count({ where: { userId: a.id } });
    expect(entries).toBe(0);
  });

  // Regression test for a real prod incident: a player ended up in two
  // simultaneous live matches (1.1s apart), caused by two concurrent
  // retryPairForWaitingUser calls for the same entry (e.g. two open tabs)
  // each finding a different still-WAITING candidate and both succeeding.
  //
  // Best-effort: a plain Promise.all of two real calls against a fast local
  // Postgres with no network latency isn't guaranteed to actually overlap —
  // one call's transaction can complete before the other starts, so this
  // won't reliably fail even without the fix. The real guarantee is
  // structural (see attemptPairing's comment: a single-row conditional
  // UPDATE can only ever be won by one concurrent transaction, by Postgres's
  // own row-locking — not something a timing-dependent test can prove
  // either way). Kept as a smoke test and as documentation of the scenario.
  it("never double-books the same waiting user across two concurrent retries", async () => {
    const a = await createTestUser({ region: "USA East" });
    const b = await createTestUser({ region: "USA East" });
    const c = await createTestUser({ region: "USA East" });

    await prisma.ratingLobbyEntry.create({
      data: { userId: a.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });
    await prisma.ratingLobbyEntry.create({
      data: { userId: b.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });
    await prisma.ratingLobbyEntry.create({
      data: { userId: c.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });

    await Promise.all([retryPairForWaitingUser(a.id), retryPairForWaitingUser(a.id)]);

    const aUnresolvedMatches = await prisma.ratingMatch.count({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }], status: "PENDING_REPORT" },
    });
    expect(aUnresolvedMatches).toBe(1);

    // Whichever of b/c didn't get matched must still be cleanly WAITING —
    // not stranded PAIRED with no match (the partial-claim leak a naive
    // "claim both ids in one updateMany" fix would produce).
    const bEntry = await prisma.ratingLobbyEntry.findFirst({ where: { userId: b.id } });
    const cEntry = await prisma.ratingLobbyEntry.findFirst({ where: { userId: c.id } });
    const statuses = [bEntry?.status, cEntry?.status].sort();
    expect(statuses).toEqual(["PAIRED", "WAITING"]);
  });

  it("never throws — this runs on every 5s lobby-page poll, so a failure here must not break the page", async () => {
    const a = await createTestUser({ region: "USA East" });
    await prisma.ratingLobbyEntry.create({
      data: { userId: a.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });

    const spy = vi.spyOn(prisma.user, "findUniqueOrThrow").mockRejectedValueOnce(new Error("simulated DB blip"));
    try {
      await expect(retryPairForWaitingUser(a.id)).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it("does not pair across regions outside either side's match distance", async () => {
    const a = await createTestUser({ region: "USA East", maxMatchDistanceKm: 1 });
    const b = await createTestUser({ region: "East Asia", maxMatchDistanceKm: 1 });

    await prisma.ratingLobbyEntry.create({
      data: { userId: a.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });
    await prisma.ratingLobbyEntry.create({
      data: { userId: b.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });

    await retryPairForWaitingUser(a.id);

    const entryA = await getActiveLobbyEntry(a.id);
    expect(entryA?.status).toBe("WAITING");
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

describe("setMatchRoomCode", () => {
  it("lets the assigned host set the room code", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const match = await prisma.$transaction((tx) => createDirectMatch(tx, a.id, b.id, PairingMethod.REMATCH));
    const hostId = getRoomHostId(match);

    await setMatchRoomCode(hostId, match.id, "AB123");

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.roomCode).toBe("AB123");
    expect(updated.roomCodeSetById).toBe(hostId);
  });

  it("rejects the non-host trying to set the room code", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const match = await prisma.$transaction((tx) => createDirectMatch(tx, a.id, b.id, PairingMethod.REMATCH));
    const hostId = getRoomHostId(match);
    const nonHostId = hostId === a.id ? b.id : a.id;

    await expect(setMatchRoomCode(nonHostId, match.id, "AB123")).rejects.toThrow(/assigned host/i);
  });
});

function createWaitingEntry(userId: string, existingRoomCode: string | null = null) {
  return prisma.ratingLobbyEntry.create({
    data: {
      userId,
      status: LobbyEntryStatus.WAITING,
      existingRoomCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
}

describe("sweepLobbyPairing", () => {
  it("makes one waiting entry host when only they have an existing room code", async () => {
    const a = await createTestUser({ region: "USA East" });
    const b = await createTestUser({ region: "USA East" });
    await createWaitingEntry(a.id, "AB123");
    await createWaitingEntry(b.id, null);

    const paired = await sweepLobbyPairing();

    expect(paired).toBe(1);
    const match = await prisma.ratingMatch.findFirstOrThrow({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match.roomCode).toBe("AB123");
    expect(match.roomCodeSetById).toBe(a.id);
  });

  it("leaves the room code unset when neither waiting entry has an existing one", async () => {
    const a = await createTestUser({ region: "USA East" });
    const b = await createTestUser({ region: "USA East" });
    await createWaitingEntry(a.id, null);
    await createWaitingEntry(b.id, null);

    await sweepLobbyPairing();

    const match = await prisma.ratingMatch.findFirstOrThrow({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match.roomCode).toBeNull();
    expect(match.roomCodeSetById).toBeNull();
  });
});
