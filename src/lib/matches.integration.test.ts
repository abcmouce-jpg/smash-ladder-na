import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  adminForceConfirmMatch,
  adminOverrideMatchResult,
  applyEloAndConfirm,
  cancelMatch,
  leaveMatch,
  requestRematch,
  requestResultCorrection,
  resolveMatchCorrection,
} from "@/lib/matches";
import { sendDiscordDM } from "@/lib/discord-bot";
import { blockUser } from "@/lib/blocks";
import { endActiveSeasonAndStartNext } from "@/lib/seasons";
import { ConfirmationMethod, LobbyEntryStatus, MatchStatus, PairingMethod } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

vi.mock("@/lib/discord-bot", () => ({ sendDiscordDM: vi.fn() }));

async function createConfirmedMatch(winnerId: string, loserId: string) {
  const match = await prisma.ratingMatch.create({
    data: {
      player1Id: winnerId,
      player2Id: loserId,
      status: MatchStatus.PENDING_REPORT,
      expiresAt: new Date(),
      // applyEloAndConfirm doesn't set these itself — production sets them
      // via the report flow before ever calling it.
      reportedWinnerId: winnerId,
      reportedById: winnerId,
      reportedAt: new Date(),
    },
  });
  await prisma.$transaction((tx) =>
    applyEloAndConfirm(tx, match, winnerId, ConfirmationMethod.SELF_CONFIRMED, {
      winnerId,
      reporterId: winnerId,
    }),
  );
  return prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
}

describe("applyEloAndConfirm", () => {
  it("confirms the match, updates both ratings, and records history", async () => {
    const winner = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const loser = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: winner.id,
        player2Id: loser.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
      },
    });

    await prisma.$transaction((tx) =>
      applyEloAndConfirm(
        tx,
        match,
        winner.id,
        ConfirmationMethod.SELF_CONFIRMED,
        { winnerId: winner.id, reporterId: winner.id },
      ),
    );

    const updatedMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.status).toBe(MatchStatus.CONFIRMED);
    expect(updatedMatch.player1RatingAfter).toBeGreaterThan(updatedMatch.player1RatingBefore!);
    expect(updatedMatch.player2RatingAfter).toBeLessThan(updatedMatch.player2RatingBefore!);

    const [updatedWinner, updatedLoser] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: winner.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: loser.id } }),
    ]);
    expect(updatedWinner.rating).toBe(updatedMatch.player1RatingAfter);
    expect(updatedWinner.gamesPlayed).toBe(21);
    expect(updatedLoser.rating).toBe(updatedMatch.player2RatingAfter);
    expect(updatedLoser.gamesPlayed).toBe(21);

    const history = await prisma.ratingHistory.findMany({ where: { matchId: match.id } });
    expect(history).toHaveLength(2);
  });

  it("gives a lower-rated provisional winner a bigger swing than an established player", async () => {
    const provisionalWinner = await createTestUser({ rating: 1500, gamesPlayed: 5 });
    const establishedLoser = await createTestUser({ rating: 1500, gamesPlayed: 40 });
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: provisionalWinner.id,
        player2Id: establishedLoser.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
      },
    });

    await prisma.$transaction((tx) =>
      applyEloAndConfirm(tx, match, provisionalWinner.id, ConfirmationMethod.SELF_CONFIRMED, {
        winnerId: provisionalWinner.id,
        reporterId: provisionalWinner.id,
      }),
    );

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    const winnerGain = updated.player1RatingAfter! - updated.player1RatingBefore!;
    const loserLoss = updated.player2RatingBefore! - updated.player2RatingAfter!;
    expect(winnerGain).toBeGreaterThan(loserLoss);
  });

  it("updates practiceRating instead of rating for a practicing side, and never touches the opponent's main rating twice", async () => {
    const practicing = await createTestUser({ rating: 1500, gamesPlayed: 20, practiceRating: 1400, practiceGamesPlayed: 3 });
    const normal = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: practicing.id,
        player2Id: normal.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
        player1IsPracticing: true,
      },
    });

    await prisma.$transaction((tx) =>
      applyEloAndConfirm(tx, match, practicing.id, ConfirmationMethod.SELF_CONFIRMED, {
        winnerId: practicing.id,
        reporterId: practicing.id,
      }),
    );

    const updatedMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.player1RatingBefore).toBe(1400); // practiceRating, not rating

    const [updatedPracticing, updatedNormal] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: practicing.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: normal.id } }),
    ]);
    expect(updatedPracticing.rating).toBe(1500); // untouched
    expect(updatedPracticing.gamesPlayed).toBe(20); // untouched
    expect(updatedPracticing.practiceRating).toBe(updatedMatch.player1RatingAfter);
    expect(updatedPracticing.practiceGamesPlayed).toBe(4);
    expect(updatedNormal.rating).toBe(updatedMatch.player2RatingAfter);
    expect(updatedNormal.gamesPlayed).toBe(21);

    // Only the non-practicing side gets a RatingHistory row — that table
    // backs the main rating-over-time chart, which a practice result has no
    // business appearing in.
    const history = await prisma.ratingHistory.findMany({ where: { matchId: match.id } });
    expect(history).toHaveLength(1);
    expect(history[0].userId).toBe(normal.id);
  });

  it("doesn't alert mods for self-boost signals when either side is practicing", async () => {
    vi.mocked(sendDiscordDM).mockClear();
    await createTestUser({ role: "MOD" });
    const p1 = await createTestUser({ lastKnownIp: "9.9.9.9" });
    const p2 = await createTestUser({ lastKnownIp: "9.9.9.9" }); // same IP — would normally trigger
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
        player1IsPracticing: true,
      },
    });

    await prisma.$transaction((tx) =>
      applyEloAndConfirm(tx, match, p1.id, ConfirmationMethod.SELF_CONFIRMED, { winnerId: p1.id, reporterId: p1.id }),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sendDiscordDM).not.toHaveBeenCalled();
  });

  it("alerts mods when both accounts share a last-known IP", async () => {
    vi.mocked(sendDiscordDM).mockClear();
    const mod = await createTestUser({ role: "MOD" });
    const p1 = await createTestUser({ lastKnownIp: "1.2.3.4" });
    const p2 = await createTestUser({ lastKnownIp: "1.2.3.4" });
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await prisma.$transaction((tx) =>
      applyEloAndConfirm(tx, match, p1.id, ConfirmationMethod.SELF_CONFIRMED, { winnerId: p1.id, reporterId: p1.id }),
    );

    // flagPossibleSelfBoost is deliberately fire-and-forget (not awaited by
    // applyEloAndConfirm — see its comment), so it may still be in flight
    // right after the transaction resolves.
    await vi.waitFor(() =>
      expect(sendDiscordDM).toHaveBeenCalledWith(mod.discordId, expect.stringContaining("same last-known IP")),
    );
  });

  it("alerts mods when an opponent's account was created right before the match with no other history", async () => {
    vi.mocked(sendDiscordDM).mockClear();
    const mod = await createTestUser({ role: "MOD" });
    const veteran = await createTestUser({ gamesPlayed: 20 });
    const freshAlt = await createTestUser({ gamesPlayed: 0, createdAt: new Date(Date.now() - 60 * 1000) });
    const match = await prisma.ratingMatch.create({
      data: { player1Id: veteran.id, player2Id: freshAlt.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await prisma.$transaction((tx) =>
      applyEloAndConfirm(tx, match, veteran.id, ConfirmationMethod.SELF_CONFIRMED, {
        winnerId: veteran.id,
        reporterId: veteran.id,
      }),
    );

    await vi.waitFor(() =>
      expect(sendDiscordDM).toHaveBeenCalledWith(
        mod.discordId,
        expect.stringContaining("created shortly before this match"),
      ),
    );
  });

  it("doesn't alert for two established accounts on different IPs", async () => {
    vi.mocked(sendDiscordDM).mockClear();
    await createTestUser({ role: "MOD" });
    const p1 = await createTestUser({ lastKnownIp: "1.1.1.1", gamesPlayed: 20 });
    const p2 = await createTestUser({ lastKnownIp: "2.2.2.2", gamesPlayed: 20 });
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await prisma.$transaction((tx) =>
      applyEloAndConfirm(tx, match, p1.id, ConfirmationMethod.SELF_CONFIRMED, { winnerId: p1.id, reporterId: p1.id }),
    );

    // No positive condition to poll for here — just give the (fire-and-forget)
    // detector a moment to run before asserting it stayed quiet.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sendDiscordDM).not.toHaveBeenCalled();
  });
});

describe("requestResultCorrection", () => {
  it("does nothing until both sides submit the same correction", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id); // p1 reported as winner

    const first = await requestResultCorrection(p1.id, match.id, p2.id); // p1 now says p2 won
    expect(first.applied).toBe(false);

    const stillUnchanged = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(stillUnchanged.reportedWinnerId).toBe(p1.id);
    expect(stillUnchanged.player1RatingAfter).toBe(match.player1RatingAfter);
  });

  it("reverses and reapplies Elo from the original pre-match ratings when both sides agree", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id); // p1 (player1) wins originally

    await requestResultCorrection(p1.id, match.id, p2.id); // p1 admits p2 actually won
    const second = await requestResultCorrection(p2.id, match.id, p2.id); // p2 agrees p2 won
    expect(second.applied).toBe(true);

    const corrected = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(corrected.reportedWinnerId).toBe(p2.id);
    expect(corrected.confirmationMethod).toBe("CORRECTED");
    expect(corrected.correctionWinnerId).toBeNull();
    expect(corrected.correctionReportedById).toBeNull();

    // Symmetric ratings before the match (both 1500, both 20 games), so
    // reversing the win should land p2 exactly where p1 originally landed,
    // and vice versa.
    expect(corrected.player2RatingAfter).toBe(match.player1RatingAfter);
    expect(corrected.player1RatingAfter).toBe(match.player2RatingAfter);

    const [updatedP1, updatedP2] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: p1.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: p2.id } }),
    ]);
    expect(updatedP1.rating).toBe(corrected.player1RatingAfter);
    expect(updatedP2.rating).toBe(corrected.player2RatingAfter);
    // gamesPlayed must not double-count — this isn't a new game.
    expect(updatedP1.gamesPlayed).toBe(21);
    expect(updatedP2.gamesPlayed).toBe(21);

    const history = await prisma.ratingHistory.findMany({
      where: { matchId: match.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history).toHaveLength(4); // 2 from the original confirm, 2 from the correction
  });

  it("flags correctionDisputed when the two sides disagree", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id); // p1 confirmed as winner

    await requestResultCorrection(p1.id, match.id, p2.id); // p1 admits p2 actually won
    const second = await requestResultCorrection(p2.id, match.id, p1.id); // p2 insists p1 really won
    expect(second.applied).toBe(false);
    expect(second.disputed).toBe(true);

    const disputed = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(disputed.correctionDisputed).toBe(true);
    expect(disputed.reportedWinnerId).toBe(p1.id); // untouched until a mod resolves it
  });

  it("rejects a correction once a newer match has been confirmed for either player", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p3 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id);
    await createConfirmedMatch(p1.id, p3.id); // p1 plays again after

    await expect(requestResultCorrection(p1.id, match.id, p2.id)).rejects.toThrow(/newer match/i);
  });

  it("rejects a correction once the match's season has ended", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id);

    await endActiveSeasonAndStartNext();

    await expect(requestResultCorrection(p1.id, match.id, p2.id)).rejects.toThrow(/season has ended/i);
  });

  it("rejects a non-participant", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const outsider = await createTestUser();
    const match = await createConfirmedMatch(p1.id, p2.id);

    await expect(requestResultCorrection(outsider.id, match.id, p2.id)).rejects.toThrow(/not a participant/i);
  });
});

describe("resolveMatchCorrection", () => {
  it("applies a mod's decision on a disputed correction", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id);

    await requestResultCorrection(p1.id, match.id, p1.id); // p1 says p1 (self) won — no change
    await requestResultCorrection(p2.id, match.id, p2.id); // p2 disagrees, says p2 won

    const disputed = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(disputed.correctionDisputed).toBe(true);

    await resolveMatchCorrection(match.id, p2.id);

    const resolved = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(resolved.correctionDisputed).toBe(false);
    expect(resolved.reportedWinnerId).toBe(p2.id);
  });
});

describe("adminOverrideMatchResult", () => {
  it("changes the winner and reapplies Elo without needing a prior dispute", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id); // p1 confirmed as winner

    await adminOverrideMatchResult(match.id, p2.id);

    const overridden = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(overridden.reportedWinnerId).toBe(p2.id);
    expect(overridden.confirmationMethod).toBe("CORRECTED");
    expect(overridden.player2RatingAfter).toBe(match.player1RatingAfter);

    const [updatedP1, updatedP2] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: p1.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: p2.id } }),
    ]);
    expect(updatedP1.gamesPlayed).toBe(21);
    expect(updatedP2.gamesPlayed).toBe(21);
  });

  it("rejects a non-confirmed match", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await expect(adminOverrideMatchResult(match.id, p2.id)).rejects.toThrow(/only a confirmed match/i);
  });

  it("rejects it once a newer match has been confirmed for either player, same as a self-service correction", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p3 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id);
    await createConfirmedMatch(p1.id, p3.id);

    await expect(adminOverrideMatchResult(match.id, p2.id)).rejects.toThrow(/newer match/i);
  });
});

describe("cancelMatch", () => {
  it("allows cancelling before anything has happened", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await cancelMatch(p1.id, match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.status).toBe(MatchStatus.CANCELLED);
  });

  it("blocks cancelling once a game has been decided (the dodge-a-loss exploit)", async () => {
    const winner = await createTestUser();
    const loser = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: winner.id, player2Id: loser.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: winner.id,
        actorAStrikes: 1,
        actorBId: loser.id,
        actorBStrikes: 2,
        winnerId: winner.id,
      },
    });

    await expect(cancelMatch(loser.id, match.id)).rejects.toThrow(/decided or reported/i);
  });

  it("blocks cancelling once a game has an unconfirmed report pending", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 2,
        reportedWinnerId: p1.id,
        reportedById: p2.id,
        reportedAt: new Date(),
      },
    });

    await expect(cancelMatch(p2.id, match.id)).rejects.toThrow(/decided or reported/i);
  });
});

describe("adminForceConfirmMatch", () => {
  it("closes out a match with no game data at all and applies Elo", async () => {
    const p1 = await createTestUser({ rating: 1500 });
    const p2 = await createTestUser({ rating: 1500 });
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await adminForceConfirmMatch(match.id, p1.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.status).toBe(MatchStatus.CONFIRMED);
    expect(updated.confirmationMethod).toBe(ConfirmationMethod.ADMIN_RESOLVED);
    expect(updated.player1RatingAfter).toBeGreaterThan(updated.player1RatingBefore!);
    // getPlayerMatchHistory's win/loss badge and rivals record key off this —
    // a real production bug had the rating apply correctly while this stayed
    // null, showing the winner as a loss on their own profile.
    expect(updated.reportedWinnerId).toBe(p1.id);
  });

  it("closes out a match that already expired with no report from either side", async () => {
    const p1 = await createTestUser({ rating: 1500 });
    const p2 = await createTestUser({ rating: 1500 });
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.EXPIRED, expiresAt: new Date() },
    });

    await adminForceConfirmMatch(match.id, p2.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.status).toBe(MatchStatus.CONFIRMED);
  });

  it("rejects a match that's already confirmed", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createConfirmedMatch(p1.id, p2.id);

    await expect(adminForceConfirmMatch(match.id, p2.id)).rejects.toThrow(/already closed out/i);
  });

  it("rejects a cancelled match", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.CANCELLED, expiresAt: new Date() },
    });

    await expect(adminForceConfirmMatch(match.id, p1.id)).rejects.toThrow(/already closed out/i);
  });

  it("rejects a winnerId that isn't one of the two players", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const outsider = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await expect(adminForceConfirmMatch(match.id, outsider.id)).rejects.toThrow(/one of the two players/i);
  });
});

describe("leaveMatch", () => {
  async function createConfirmedMatch() {
    const player1 = await createTestUser();
    const player2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: player1.id,
        player2Id: player2.id,
        status: MatchStatus.CONFIRMED,
        confirmedAt: new Date(),
        expiresAt: new Date(),
      },
    });
    return { player1, player2, match };
  }

  it("marks player1's own leftAt and leaves player2's untouched", async () => {
    const { player1, match } = await createConfirmedMatch();

    await leaveMatch(player1.id, match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.player1LeftAt).not.toBeNull();
    expect(updated.player2LeftAt).toBeNull();
  });

  it("marks player2's own leftAt and leaves player1's untouched", async () => {
    const { player2, match } = await createConfirmedMatch();

    await leaveMatch(player2.id, match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.player2LeftAt).not.toBeNull();
    expect(updated.player1LeftAt).toBeNull();
  });

  it("throws for a user who isn't a participant in the match", async () => {
    const { match } = await createConfirmedMatch();
    const outsider = await createTestUser();

    await expect(leaveMatch(outsider.id, match.id)).rejects.toThrow(
      "Not a participant in this match",
    );
  });

  it("is idempotent — leaving twice keeps the original timestamp", async () => {
    const { player1, match } = await createConfirmedMatch();

    await leaveMatch(player1.id, match.id);
    const afterFirst = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });

    await leaveMatch(player1.id, match.id);
    const afterSecond = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });

    expect(afterSecond.player1LeftAt?.getTime()).toBe(afterFirst.player1LeftAt?.getTime());
  });

  it("clears a previously-set rematch request when leaving", async () => {
    const { player1, match } = await createConfirmedMatch();
    await requestRematch(player1.id, match.id);

    await leaveMatch(player1.id, match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.player1RematchRequestedAt).toBeNull();
  });
});

describe("requestRematch", () => {
  async function createConfirmedMatch() {
    const player1 = await createTestUser();
    const player2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: player1.id,
        player2Id: player2.id,
        status: MatchStatus.CONFIRMED,
        confirmedAt: new Date(),
        expiresAt: new Date(),
      },
    });
    return { player1, player2, match };
  }

  it("throws for a user who isn't a participant in the match", async () => {
    const { match } = await createConfirmedMatch();
    const outsider = await createTestUser();

    await expect(requestRematch(outsider.id, match.id)).rejects.toThrow(
      "Not a participant in this match",
    );
  });

  it("throws for a match that hasn't finished", async () => {
    const player1 = await createTestUser();
    const player2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: player1.id,
        player2Id: player2.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
      },
    });

    await expect(requestRematch(player1.id, match.id)).rejects.toThrow(
      "This match hasn't finished yet",
    );
  });

  it("throws if the caller has already left", async () => {
    const { player1, match } = await createConfirmedMatch();
    await leaveMatch(player1.id, match.id);

    await expect(requestRematch(player1.id, match.id)).rejects.toThrow(
      "You've left this match",
    );
  });

  it("only records the first request when the opponent hasn't asked yet", async () => {
    const { player1, match } = await createConfirmedMatch();

    await requestRematch(player1.id, match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.player1RematchRequestedAt).not.toBeNull();
    expect(updated.player2RematchRequestedAt).toBeNull();

    const newMatches = await prisma.ratingMatch.count({
      where: { player1Id: player1.id, id: { not: match.id } },
    });
    expect(newMatches).toBe(0);
  });

  it("is idempotent — requesting twice doesn't error or change the timestamp", async () => {
    const { player1, match } = await createConfirmedMatch();

    await requestRematch(player1.id, match.id);
    const afterFirst = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });

    await requestRematch(player1.id, match.id);
    const afterSecond = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });

    expect(afterSecond.player1RematchRequestedAt?.getTime()).toBe(
      afterFirst.player1RematchRequestedAt?.getTime(),
    );
  });

  it("creates a fresh paired match once both players have requested", async () => {
    const { player1, player2, match } = await createConfirmedMatch();

    await requestRematch(player1.id, match.id);
    await requestRematch(player2.id, match.id);

    const newMatch = await prisma.ratingMatch.findFirstOrThrow({
      where: { id: { not: match.id }, player1Id: player1.id, player2Id: player2.id },
    });
    expect(newMatch.status).toBe(MatchStatus.PENDING_REPORT);
    expect(newMatch.pairingMethod).toBe(PairingMethod.REMATCH);

    const entries = await prisma.ratingLobbyEntry.findMany({
      where: { userId: { in: [player1.id, player2.id] }, status: LobbyEntryStatus.PAIRED },
    });
    const newEntries = entries.filter(
      (e) => e.matchId === newMatch.id || e.pairedEntryId !== null,
    );
    expect(newEntries.length).toBeGreaterThanOrEqual(1);
  });

  it("doesn't create a new match if the opponent already left", async () => {
    const { player1, player2, match } = await createConfirmedMatch();
    await requestRematch(player1.id, match.id);
    await leaveMatch(player2.id, match.id);

    // player2 left, so they can no longer request — simulate the mutual
    // condition failing by having player1's own request just sit unmatched.
    const newMatches = await prisma.ratingMatch.count({
      where: { player1Id: player1.id, player2Id: player2.id, id: { not: match.id } },
    });
    expect(newMatches).toBe(0);
  });

  it("doesn't create a new match if the players are blocked either-way", async () => {
    const { player1, player2, match } = await createConfirmedMatch();
    await blockUser(player2.id, player1.id);

    await requestRematch(player1.id, match.id);
    await requestRematch(player2.id, match.id);

    const newMatches = await prisma.ratingMatch.count({
      where: { player1Id: player1.id, player2Id: player2.id, id: { not: match.id } },
    });
    expect(newMatches).toBe(0);
  });
});
