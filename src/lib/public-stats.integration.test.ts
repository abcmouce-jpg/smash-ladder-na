import { describe, it, expect } from "vitest";
import { MatchStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { getMatchesPerDay } from "@/lib/public-stats";
import { createTestUser } from "@/test/factories";

async function createConfirmedMatch(p1: string, p2: string, confirmedAt: Date) {
  return prisma.ratingMatch.create({
    data: {
      player1Id: p1,
      player2Id: p2,
      status: MatchStatus.CONFIRMED,
      confirmedAt,
      expiresAt: new Date(),
    },
  });
}

describe("getMatchesPerDay", () => {
  it("returns confirmed match timestamps from inside the window", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const confirmedAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    await createConfirmedMatch(p1.id, p2.id, confirmedAt);

    expect(await getMatchesPerDay(30)).toContain(confirmedAt.toISOString());
  });

  it("excludes matches confirmed before the window", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
    await createConfirmedMatch(p1.id, p2.id, old);

    expect(await getMatchesPerDay(30)).not.toContain(old.toISOString());
  });

  it("only counts CONFIRMED matches, even when a pending one has a confirmedAt", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const confirmedAt = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.PENDING_REPORT,
        confirmedAt,
        expiresAt: new Date(),
      },
    });

    expect(await getMatchesPerDay(30)).not.toContain(confirmedAt.toISOString());
  });

  it("returns an empty array when there are no matches at all", async () => {
    expect(await getMatchesPerDay(30)).toEqual([]);
  });
});
