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

  // #129: a burst of finished matches created after an older in-progress
  // match used to push it out of the feed's flat top-40, even though it was
  // still live with a stream running. In-progress matches must never be cut
  // by the recent-finished window's own limit.
  it("always includes an older in-progress match even when 40+ newer finished matches exist", async () => {
    const { getLiveTwitchUsernames } = await import("@/lib/twitch-helix");
    vi.mocked(getLiveTwitchUsernames).mockResolvedValue(new Set(["streamerchannel"]));

    const streamer = await createTestUser({ twitchUsername: "StreamerChannel" });
    const opponent = await createTestUser();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const oldInProgress = await prisma.ratingMatch.create({
      data: {
        player1Id: streamer.id,
        player2Id: opponent.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt,
        createdAt: new Date(Date.now() - 60_000),
      },
    });

    // 45 newer finished matches — more than FEED_LIMIT (40) — all created
    // after the in-progress one.
    for (let i = 0; i < 45; i++) {
      const p1 = await createTestUser();
      const p2 = await createTestUser();
      await prisma.ratingMatch.create({
        data: {
          player1Id: p1.id,
          player2Id: p2.id,
          status: MatchStatus.CONFIRMED,
          confirmedAt: new Date(),
          reportedWinnerId: p1.id,
          expiresAt,
        },
      });
    }

    const entries = await getMatchFeed();
    const stillPresent = entries.find((e) => e.id === oldInProgress.id);
    expect(stillPresent).toBeDefined();
    expect(stillPresent?.hasLiveStreamer).toBe(true);
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
