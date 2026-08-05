import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { finalizeExpiredMatches } from "@/lib/finalize";
import { MatchStatus, UserRole } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";
import * as discordBot from "@/lib/discord-bot";

const past = new Date(Date.now() - 60_000);

describe("finalizeExpiredMatches", () => {
  it("expires a match nobody reported on, with no rating impact", async () => {
    const a = await createTestUser({ rating: 1500 });
    const b = await createTestUser({ rating: 1500 });
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: a.id,
        player2Id: b.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: past,
      },
    });

    const result = await finalizeExpiredMatches(new Date());

    expect(result.expiredNoReport).toBe(1);
    expect(result.autoConfirmed).toBe(0);
    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.status).toBe(MatchStatus.EXPIRED);
    const [userA, userB] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    expect(userA.rating).toBe(1500);
    expect(userB.rating).toBe(1500);
  });

  it("auto-confirms a hanging report and charges the non-reporter a no-show", async () => {
    const reporter = await createTestUser({ rating: 1500 });
    const ghost = await createTestUser({ rating: 1500 });
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: reporter.id,
        player2Id: ghost.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: past,
      },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: reporter.id,
        actorAStrikes: 1,
        actorBId: ghost.id,
        actorBStrikes: 2,
        finalStage: "Battlefield",
        reportedWinnerId: reporter.id,
        reportedById: reporter.id,
        reportedAt: past,
      },
    });

    const result = await finalizeExpiredMatches(new Date());

    expect(result.autoConfirmed).toBe(1);
    expect(result.expiredNoReport).toBe(0);

    const updatedGhost = await prisma.user.findUniqueOrThrow({ where: { id: ghost.id } });
    expect(updatedGhost.noShowCount).toBe(1);
  });

  it("leaves not-yet-expired matches untouched", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await prisma.ratingMatch.create({
      data: {
        player1Id: a.id,
        player2Id: b.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const result = await finalizeExpiredMatches(new Date());
    expect(result.expiredNoReport).toBe(0);
    expect(result.autoConfirmed).toBe(0);
  });

  it("awards the set to a player already ahead 1-0 when the opponent never responds again", async () => {
    const leader = await createTestUser({ rating: 1500 });
    const ghost = await createTestUser({ rating: 1500 });
    const match = await prisma.ratingMatch.create({
      data: { player1Id: leader.id, player2Id: ghost.id, status: MatchStatus.PENDING_REPORT, expiresAt: past },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: leader.id,
        actorAStrikes: 1,
        actorBId: ghost.id,
        actorBStrikes: 2,
        finalStage: "Battlefield",
        winnerId: leader.id,
      },
    });
    // Game 2 exists but nobody ever locked in a character or reported it.
    await prisma.matchGame.create({
      data: { matchId: match.id, gameNumber: 2, actorAId: leader.id, actorAStrikes: 3, actorBId: ghost.id, actorBStrikes: 0 },
    });

    const result = await finalizeExpiredMatches(new Date());

    expect(result.closedOutOnLead).toBe(1);
    expect(result.autoConfirmed).toBe(0);
    expect(result.expiredNoReport).toBe(0);

    const updatedMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.status).toBe(MatchStatus.CONFIRMED);
    expect(updatedMatch.reportedWinnerId).toBe(leader.id);

    const [updatedLeader, updatedGhost] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: leader.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: ghost.id } }),
    ]);
    expect(updatedLeader.rating).toBeGreaterThan(1500);
    expect(updatedGhost.rating).toBeLessThan(1500);
    expect(updatedGhost.noShowCount).toBe(1);
    expect(updatedGhost.queueCooldownUntil).not.toBeNull();
  });

  it("awards the set to a player already ahead 2-0 the same way", async () => {
    const leader = await createTestUser({ rating: 1500 });
    const ghost = await createTestUser({ rating: 1500 });
    const match = await prisma.ratingMatch.create({
      data: { player1Id: leader.id, player2Id: ghost.id, status: MatchStatus.PENDING_REPORT, expiresAt: past },
    });
    for (let gameNumber = 1; gameNumber <= 2; gameNumber++) {
      await prisma.matchGame.create({
        data: {
          matchId: match.id,
          gameNumber,
          actorAId: leader.id,
          actorAStrikes: 1,
          actorBId: ghost.id,
          actorBStrikes: 2,
          finalStage: "Battlefield",
          winnerId: leader.id,
        },
      });
    }

    const result = await finalizeExpiredMatches(new Date());

    expect(result.closedOutOnLead).toBe(1);
    const updatedMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.status).toBe(MatchStatus.CONFIRMED);
    expect(updatedMatch.reportedWinnerId).toBe(leader.id);
  });

  it("does NOT auto-confirm or award a match whose current game is contested", async () => {
    const a = await createTestUser({ rating: 1500 });
    const b = await createTestUser({ rating: 1500 });
    const match = await prisma.ratingMatch.create({
      data: { player1Id: a.id, player2Id: b.id, status: MatchStatus.PENDING_REPORT, expiresAt: past },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: a.id,
        actorAStrikes: 1,
        actorBId: b.id,
        actorBStrikes: 2,
        finalStage: "Battlefield",
        winnerId: a.id,
      },
    });
    // Game 2: both sides reported, disagreed — contested, not escalated. The
    // finalizer must neither accept the first reporter's claim (autoConfirm)
    // nor hand the set to the leader (closeOutUnansweredLead), since the
    // trailing side DID respond — they just disagree on the winner.
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 2,
        actorAId: a.id,
        actorAStrikes: 3,
        actorBId: b.id,
        actorBStrikes: 0,
        finalStage: "Battlefield",
        reportedWinnerId: a.id,
        reportedById: a.id,
        reportedAt: past,
        secondReportWinnerId: b.id,
        secondReportById: b.id,
        secondReportAt: past,
      },
    });

    const result = await finalizeExpiredMatches(new Date());

    expect(result.autoConfirmed).toBe(0);
    expect(result.closedOutOnLead).toBe(0);
    expect(result.expiredNoReport).toBe(1);
    const updatedMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.status).toBe(MatchStatus.EXPIRED);
    const [userA, userB] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    expect(userA.rating).toBe(1500);
    expect(userB.rating).toBe(1500);
  });

  it("does NOT auto-close a genuinely contested score (both sides have a win)", async () => {
    const a = await createTestUser({ rating: 1500 });
    const b = await createTestUser({ rating: 1500 });
    const match = await prisma.ratingMatch.create({
      data: { player1Id: a.id, player2Id: b.id, status: MatchStatus.PENDING_REPORT, expiresAt: past },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: a.id,
        actorAStrikes: 1,
        actorBId: b.id,
        actorBStrikes: 2,
        finalStage: "Battlefield",
        winnerId: a.id,
      },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 2,
        actorAId: a.id,
        actorAStrikes: 3,
        actorBId: b.id,
        actorBStrikes: 0,
        finalStage: "Battlefield",
        winnerId: b.id,
      },
    });

    const result = await finalizeExpiredMatches(new Date());

    expect(result.closedOutOnLead).toBe(0);
    expect(result.expiredNoReport).toBe(1);
    const updatedMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.status).toBe(MatchStatus.EXPIRED);
  });

  // Regression coverage for the duplicate mod-DM bug: the GitHub Actions
  // cron fires every 5 minutes and a slow run can still be in flight when
  // the next one starts, so finalizeExpiredMatches must tolerate two
  // overlapping invocations racing on the exact same overdue matches
  // without double-applying rating changes or double-sending DMs.
  describe("concurrent invocations (overlapping cron runs)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("only auto-confirms a hanging report once and DMs mods once", async () => {
      const dmSpy = vi.spyOn(discordBot, "sendDiscordDM").mockResolvedValue(undefined);
      await createTestUser({ role: UserRole.MOD });
      const reporter = await createTestUser({ rating: 1500 });
      const ghost = await createTestUser({ rating: 1500 });
      const match = await prisma.ratingMatch.create({
        data: { player1Id: reporter.id, player2Id: ghost.id, status: MatchStatus.PENDING_REPORT, expiresAt: past },
      });
      await prisma.matchGame.create({
        data: {
          matchId: match.id,
          gameNumber: 1,
          actorAId: reporter.id,
          actorAStrikes: 1,
          actorBId: ghost.id,
          actorBStrikes: 2,
          finalStage: "Battlefield",
          reportedWinnerId: reporter.id,
          reportedById: reporter.id,
          reportedAt: past,
        },
      });

      const now = new Date();
      const [r1, r2] = await Promise.all([finalizeExpiredMatches(now), finalizeExpiredMatches(now)]);

      expect(r1.autoConfirmed + r2.autoConfirmed).toBe(1);

      const updatedGhost = await prisma.user.findUniqueOrThrow({ where: { id: ghost.id } });
      expect(updatedGhost.noShowCount).toBe(1);

      const autoConfirmDms = dmSpy.mock.calls.filter(([, content]) => content.includes("Auto-confirmed"));
      expect(autoConfirmDms).toHaveLength(1);
    });

    it("only awards an unanswered lead once and DMs mods once", async () => {
      const dmSpy = vi.spyOn(discordBot, "sendDiscordDM").mockResolvedValue(undefined);
      await createTestUser({ role: UserRole.MOD });
      const leader = await createTestUser({ rating: 1500 });
      const ghost = await createTestUser({ rating: 1500 });
      const match = await prisma.ratingMatch.create({
        data: { player1Id: leader.id, player2Id: ghost.id, status: MatchStatus.PENDING_REPORT, expiresAt: past },
      });
      await prisma.matchGame.create({
        data: {
          matchId: match.id,
          gameNumber: 1,
          actorAId: leader.id,
          actorAStrikes: 1,
          actorBId: ghost.id,
          actorBStrikes: 2,
          finalStage: "Battlefield",
          winnerId: leader.id,
        },
      });
      await prisma.matchGame.create({
        data: { matchId: match.id, gameNumber: 2, actorAId: leader.id, actorAStrikes: 3, actorBId: ghost.id, actorBStrikes: 0 },
      });

      const now = new Date();
      const [r1, r2] = await Promise.all([finalizeExpiredMatches(now), finalizeExpiredMatches(now)]);

      expect(r1.closedOutOnLead + r2.closedOutOnLead).toBe(1);

      const updatedLeader = await prisma.user.findUniqueOrThrow({ where: { id: leader.id } });
      const updatedGhost = await prisma.user.findUniqueOrThrow({ where: { id: ghost.id } });
      // If Elo were applied twice, the leader's rating gain would compound
      // well past a single-application delta.
      expect(updatedGhost.noShowCount).toBe(1);
      expect(updatedLeader.rating - 1500).toBeLessThan(64);

      const dms = dmSpy.mock.calls.filter(([, content]) => content.includes("was already ahead"));
      expect(dms).toHaveLength(1);
    });

    it("only expires a no-report match once and DMs mods once", async () => {
      const dmSpy = vi.spyOn(discordBot, "sendDiscordDM").mockResolvedValue(undefined);
      await createTestUser({ role: UserRole.MOD });
      const a = await createTestUser({ rating: 1500 });
      const b = await createTestUser({ rating: 1500 });
      await prisma.ratingMatch.create({
        data: { player1Id: a.id, player2Id: b.id, status: MatchStatus.PENDING_REPORT, expiresAt: past },
      });

      const now = new Date();
      const [r1, r2] = await Promise.all([finalizeExpiredMatches(now), finalizeExpiredMatches(now)]);

      expect(r1.expiredNoReport + r2.expiredNoReport).toBe(1);

      const dms = dmSpy.mock.calls.filter(([, content]) => content.includes("Expired with no report"));
      expect(dms).toHaveLength(1);
    });
  });
});
