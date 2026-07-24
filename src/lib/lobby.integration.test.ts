import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { joinLobbyAndTryPair } from "@/lib/lobby";
import { createTestUser } from "@/test/factories";

describe("joinLobbyAndTryPair", () => {
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

  it("requires a region to be set before joining", async () => {
    const noRegion = await createTestUser({ region: null });
    await expect(joinLobbyAndTryPair(noRegion.id)).rejects.toThrow(/region/i);
  });
});
