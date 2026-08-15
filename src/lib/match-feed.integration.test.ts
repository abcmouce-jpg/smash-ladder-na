import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getMatchFeed } from "@/lib/match-feed";
import { MatchStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

vi.mock("@/lib/twitch-helix", () => ({
  getLiveTwitchUsernames: vi.fn(),
}));

describe("getMatchFeed", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("only treats a match as having a live streamer while it's still in progress", async () => {
    const { getLiveTwitchUsernames } = await import("@/lib/twitch-helix");
    vi.mocked(getLiveTwitchUsernames).mockResolvedValue(new Set(["streamerchannel"]));

    const streamer = await createTestUser({ twitchUsername: "StreamerChannel" });
    const opponent = await createTestUser();

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const inProgress = await prisma.ratingMatch.create({
      data: { player1Id: streamer.id, player2Id: opponent.id, status: MatchStatus.PENDING_REPORT, expiresAt },
    });
    const finished = await prisma.ratingMatch.create({
      data: {
        player1Id: streamer.id,
        player2Id: opponent.id,
        status: MatchStatus.CONFIRMED,
        confirmedAt: new Date(),
        reportedWinnerId: streamer.id,
        expiresAt,
      },
    });
    const cancelled = await prisma.ratingMatch.create({
      data: { player1Id: streamer.id, player2Id: opponent.id, status: MatchStatus.CANCELLED, expiresAt },
    });

    const entries = await getMatchFeed();
    const byId = new Map(entries.map((e) => [e.id, e]));

    expect(byId.get(inProgress.id)?.hasLiveStreamer).toBe(true);
    expect(byId.get(finished.id)?.hasLiveStreamer).toBe(false);
    expect(byId.get(cancelled.id)?.hasLiveStreamer).toBe(false);
  });

  it("shows the character from the latest game, not the profile main", async () => {
    const player = await createTestUser({ mainCharacter: "Fox" });
    const opponent = await createTestUser({ mainCharacter: "Marth" });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const match = await prisma.ratingMatch.create({
      data: { player1Id: player.id, player2Id: opponent.id, status: MatchStatus.REPORTED, expiresAt },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: player.id,
        actorAStrikes: 1,
        actorACharacter: "Falco",
        actorBId: opponent.id,
        actorBStrikes: 2,
        actorBCharacter: "Jigglypuff",
        winnerId: player.id,
      },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 2,
        actorAId: player.id,
        actorAStrikes: 1,
        actorACharacter: "Falco",
        actorBId: opponent.id,
        actorBStrikes: 2,
        actorBCharacter: "Pikachu",
        winnerId: opponent.id,
      },
    });

    const entry = (await getMatchFeed()).find((e) => e.id === match.id);
    expect(entry?.player1.currentCharacter).toBe("Falco");
    expect(entry?.player2.currentCharacter).toBe("Pikachu");
  });

  it("falls back to the profile main while game 1 blind picks are pending", async () => {
    const player = await createTestUser({ mainCharacter: "Fox" });
    const opponent = await createTestUser({ mainCharacter: "Marth" });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const match = await prisma.ratingMatch.create({
      data: { player1Id: player.id, player2Id: opponent.id, status: MatchStatus.PENDING_REPORT, expiresAt },
    });

    const entry = (await getMatchFeed()).find((e) => e.id === match.id);
    expect(entry?.player1.currentCharacter).toBe("Fox");
    expect(entry?.player2.currentCharacter).toBe("Marth");
  });
});
