import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";
import { DELETED_USERNAME } from "@/lib/account";
import * as discordBot from "@/lib/discord-bot";
import type { DiscordDMOutcome, DiscordDMTally } from "@/lib/discord-bot";
import { sendReengagementBatch, countDormantPlayers, reengagementMessage } from "@/lib/reengagement";

// Mock sendDiscordDMsSequentially, not sendDiscordDM: the sequential sender
// calls sendDiscordDM through its own module-internal binding, so a spy on the
// export never intercepts it — an earlier version of this file left the real
// sender running against Discord with the production bot token. Faking the
// sequential one keeps the hooks (and so reengagement's own stamp-rollback and
// stop-early logic) under test while nothing leaves the machine.
function fakeSender(outcomeFor: (index: number) => DiscordDMOutcome) {
  return vi
    .spyOn(discordBot, "sendDiscordDMsSequentially")
    .mockImplementation(async (recipients, _content, _delayMs, hooks = {}) => {
      const tally: DiscordDMTally = { sent: 0, blocked: 0, rate_limited: 0, error: 0, no_token: 0 };
      let index = 0;
      for (const { discordId } of recipients) {
        const outcome = outcomeFor(index);
        index += 1;
        tally[outcome] += 1;
        hooks.onResult?.(discordId, outcome);
        if (outcome === "rate_limited" && hooks.onRateLimit?.(tally) === true) break;
      }
      return tally;
    });
}

const allSent = () => fakeSender(() => "sent");

// Each test pins its own active season and closes whatever else was open.
async function startSeason(startsAt: Date, name = "Test Season") {
  await prisma.season.updateMany({
    where: { endsAt: null },
    data: { endsAt: new Date(startsAt.getTime() - 1000) },
  });
  return prisma.season.create({ data: { name, startsAt, scheduledEndAt: null } });
}

async function playedSetAt(p1: { id: string }, p2: { id: string }, confirmedAt: Date) {
  return prisma.ratingMatch.create({
    data: {
      player1Id: p1.id,
      player2Id: p2.id,
      status: MatchStatus.CONFIRMED,
      confirmedAt,
      expiresAt: confirmedAt,
    },
  });
}

const lastSeason = new Date("2026-08-01T00:00:00Z");
const seasonStart = new Date("2026-09-25T00:00:00Z");

// Other tests in the suite leave users behind, so assert on our own fixtures'
// reengagedAt rather than on suite-wide counts wherever it matters.
async function stampOf(user: { id: string }) {
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return row.reengagedAt;
}

describe("findDormantPlayers (via sendReengagementBatch/countDormantPlayers)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("finds a player who played a previous season even though the rollover zeroed gamesPlayed", async () => {
    // The regression this guards: the rollover sets gamesPlayed = 0 for
    // everyone (endActiveSeasonAndStartNext), so keying "has played before" off
    // gamesPlayed > 0 actually asked "played THIS season" — the exact opposite
    // of dormancy. On production that combination matched 0 of the 2,405
    // genuinely dormant players, so the campaign would have sent nothing.
    const dormant = await createTestUser({ gamesPlayed: 0 });
    const opponent = await createTestUser({ gamesPlayed: 0 });
    await playedSetAt(dormant, opponent, lastSeason);
    await startSeason(seasonStart);

    expect(await countDormantPlayers()).not.toBeNull();

    const sender = allSent();
    await sendReengagementBatch({ limit: 500, delayMs: 0 });

    expect(sender).toHaveBeenCalled();
    expect(await stampOf(dormant)).not.toBeNull();
  });

  it("leaves out a player who has already played this season", async () => {
    const active = await createTestUser({ gamesPlayed: 0 });
    const opponent = await createTestUser({ gamesPlayed: 0 });
    await startSeason(seasonStart);
    await playedSetAt(active, opponent, new Date(seasonStart.getTime() + 86_400_000));

    allSent();
    await sendReengagementBatch({ limit: 500, delayMs: 0 });

    expect(await stampOf(active)).toBeNull();
  });

  it("leaves out a player who has never played at all — this is a win-back, not onboarding", async () => {
    const never = await createTestUser({ gamesPlayed: 0 });
    await startSeason(seasonStart);

    allSent();
    await sendReengagementBatch({ limit: 500, delayMs: 0 });

    expect(await stampOf(never)).toBeNull();
  });

  it("never messages the same player twice for one season", async () => {
    const dormant = await createTestUser({ gamesPlayed: 0 });
    const opponent = await createTestUser({ gamesPlayed: 0 });
    await playedSetAt(dormant, opponent, lastSeason);
    await startSeason(seasonStart);

    allSent();
    await sendReengagementBatch({ limit: 500, delayMs: 0 });
    const first = await stampOf(dormant);
    expect(first).not.toBeNull();

    allSent();
    await sendReengagementBatch({ limit: 500, delayMs: 0 });

    expect(await stampOf(dormant)).toEqual(first);
  });

  it("skips a player who turned the rollover DM off", async () => {
    const dormant = await createTestUser({ gamesPlayed: 0 });
    const opponent = await createTestUser({ gamesPlayed: 0 });
    await playedSetAt(dormant, opponent, lastSeason);
    await prisma.user.update({
      where: { id: dormant.id },
      data: { notificationsDisabled: ["DM_SEASON_ROLLOVER"] },
    });
    await startSeason(seasonStart);

    allSent();
    await sendReengagementBatch({ limit: 500, delayMs: 0 });

    expect(await stampOf(dormant)).toBeNull();
  });

  it("skips an account that was deleted, by either the current or the legacy signal", async () => {
    // deleteMyAccount keeps the row and leaves status ACTIVE, so a deleted
    // account looks exactly like a dormant player — 203 of the 2,405
    // production candidates were deleted accounts. The same function deletes
    // their push subscriptions so a ghost account stops getting notifications
    // it never asked for; a win-back DM would walk straight back through that.
    const opponent = await createTestUser({ gamesPlayed: 0 });

    // Current delete path: real discordId kept, username anonymized.
    const deletedNow = await createTestUser({ gamesPlayed: 0 });
    await playedSetAt(deletedNow, opponent, lastSeason);
    await prisma.user.update({ where: { id: deletedNow.id }, data: { username: DELETED_USERNAME } });

    // Legacy delete path: discordId scrambled to a non-snowflake.
    const deletedLegacy = await createTestUser({ gamesPlayed: 0 });
    await playedSetAt(deletedLegacy, opponent, lastSeason);
    await prisma.user.update({
      where: { id: deletedLegacy.id },
      data: { discordId: `deleted-${deletedLegacy.id}` },
    });

    await startSeason(seasonStart);

    allSent();
    await sendReengagementBatch({ limit: 500, delayMs: 0 });

    expect(await stampOf(deletedNow)).toBeNull();
    expect(await stampOf(deletedLegacy)).toBeNull();
  });

  it("rolls the stamp back for a rate-limited recipient and stops the run", async () => {
    // A 429 means the message never landed. Leaving the stamp on would retire
    // that player from the campaign without ever having reached them, and
    // pushing on through rate limits is what gets a Discord application
    // suspended — which here would also take down OAuth sign-in.
    const a = await createTestUser({ gamesPlayed: 0 });
    const b = await createTestUser({ gamesPlayed: 0 });
    const opponent = await createTestUser({ gamesPlayed: 0 });
    await playedSetAt(a, opponent, lastSeason);
    await playedSetAt(b, opponent, lastSeason);
    await startSeason(seasonStart);

    fakeSender(() => "rate_limited");
    const result = await sendReengagementBatch({ limit: 500, delayMs: 0 });

    expect(result?.sent).toBe(0);
    expect(result?.requeued).toBeGreaterThanOrEqual(2);
    expect(result?.stoppedEarly).toBe(true);
    expect(await stampOf(a)).toBeNull();
    expect(await stampOf(b)).toBeNull();
  });

  it("keeps the stamp for a recipient Discord refuses outright", async () => {
    const dormant = await createTestUser({ gamesPlayed: 0 });
    const opponent = await createTestUser({ gamesPlayed: 0 });
    await playedSetAt(dormant, opponent, lastSeason);
    await startSeason(seasonStart);

    fakeSender(() => "blocked");
    const result = await sendReengagementBatch({ limit: 500, delayMs: 0 });

    expect(result?.sent).toBe(0);
    expect(result?.blocked).toBeGreaterThanOrEqual(1);
    // Retrying changes nothing for a closed DM inbox, so this player is done.
    expect(await stampOf(dormant)).not.toBeNull();
  });

  it("a dry run reports the size without messaging or stamping anyone", async () => {
    const dormant = await createTestUser({ gamesPlayed: 0 });
    const opponent = await createTestUser({ gamesPlayed: 0 });
    await playedSetAt(dormant, opponent, lastSeason);
    await startSeason(seasonStart);

    const sender = allSent();
    const result = await sendReengagementBatch({ dryRun: true, limit: 500 });

    expect(result?.dryRun).toBe(true);
    expect(result?.eligible).toBeGreaterThanOrEqual(1);
    expect(result?.sent).toBe(0);
    expect(sender).not.toHaveBeenCalled();
    expect(await stampOf(dormant)).toBeNull();
  });
});

describe("reengagementMessage", () => {
  it("names the season, says ratings reset, and tells the reader how to opt out", () => {
    // 2026-11-26T01:00Z is still November 25 in the ladder's time zone, which
    // is the date the leaderboard shows — the message must agree with it no
    // matter which machine sends it.
    const body = reengagementMessage("Season 1", new Date("2026-11-26T01:00:00Z"));
    expect(body).toContain("Season 1");
    expect(body).toContain("November 25");
    expect(body).toMatch(/reset/i);
    expect(body).toMatch(/Notifications/);
    expect(body).toContain("/lobby");
  });

  it("omits the deadline sentence when the season has no scheduled end", () => {
    expect(reengagementMessage("Season 2", null)).not.toMatch(/It runs until/);
  });
});
