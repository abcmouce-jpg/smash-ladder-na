import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { MatchStatus } from "@/generated/prisma/enums";
import { sendDiscordDM } from "@/lib/discord-bot";
import { LEADERBOARD_MIN_GAMES, type Achievement } from "@/lib/rank-tier";

// Pre-season launch announcement, shown site-wide until this passes.
// -04:00 is ET's summer (EDT) offset — update if this ever needs to move
// past a DST boundary.
export const PRE_SEASON_STARTS_AT = new Date("2026-07-25T18:00:00-04:00");

export const PRE_SEASON_NAME = "Preseason";

// The preseason is a fixed 2-month trial run before Season 1 proper — the
// actual rollover is still triggered manually via the admin Seasons page
// (see endActiveSeasonAndStartNext), but players should be able to see
// roughly when to expect that, not just "whenever a mod gets to it."
export const PRE_SEASON_DURATION_MONTHS = 2;
export const PRE_SEASON_EXPECTED_END_AT = new Date(
  Date.UTC(
    PRE_SEASON_STARTS_AT.getUTCFullYear(),
    PRE_SEASON_STARTS_AT.getUTCMonth() + PRE_SEASON_DURATION_MONTHS,
    PRE_SEASON_STARTS_AT.getUTCDate(),
    PRE_SEASON_STARTS_AT.getUTCHours(),
    PRE_SEASON_STARTS_AT.getUTCMinutes(),
  ),
);

export function hasPreSeasonStarted() {
  return Date.now() >= PRE_SEASON_STARTS_AT.getTime();
}

// When the active season is expected to end, for display (the leaderboard's
// countdown) and for endActiveSeasonIfDue's auto-rollover check — null when
// there's nothing to count down to. A season's endsAt is only ever stamped
// once it's actually over (endActiveSeasonAndStartNext); scheduledEndAt is
// the announced rollover time for a still-active season, set at creation
// (see the admin Seasons form) so a countdown and auto-rollover both work
// for any season, not just the preseason.
export function getSeasonEndsAt(season: { endsAt: Date | null; scheduledEndAt: Date | null }): Date | null {
  return season.endsAt ?? season.scheduledEndAt;
}

// Split out from the SeasonEndingBanner server component so its render body
// never calls Date.now() directly — components must stay pure per React's
// rules, even server-only ones.
export function isWithinSeasonEndingWindow(endsAt: Date, windowMs: number, now = new Date()) {
  return endsAt.getTime() - now.getTime() <= windowMs;
}

// Temporary: ending a season resets EVERYONE's rating, and enough people
// hold ADMIN now (mostly for community/promotion reasons, not moderation)
// that this narrows who can trigger it, independent of the ADMIN/MOD role
// check. Revisit once ADMIN grants are reviewed.
export const SEASON_MANAGER_USER_ID = process.env.SEASON_MANAGER_USER_ID?.trim() || null;

export async function getActiveSeason() {
  return prisma.season.findFirst({ where: { endsAt: null }, orderBy: { startsAt: "desc" } });
}

// Used at match-confirm time; creates Season 1 on first use so the app
// doesn't need a manual setup step before matches can be rated.
export async function ensureActiveSeason() {
  const existing = await getActiveSeason();
  if (existing) return existing;
  return prisma.season.create({ data: { name: "Season 1" } });
}

export async function listPastSeasons() {
  return prisma.season.findMany({
    where: { endsAt: { not: null } },
    orderBy: { startsAt: "desc" },
  });
}

const PLACEMENT_MEDAL = ["🥇", "🥈", "🥉"];
const PLACEMENT_LABEL = ["Champion", "Runner-up", "3rd Place"];

// SeasonStanding rows are written once at rollover (endActiveSeasonAndStartNext)
// and never touched again — the only place a season's outcome survives once
// ratings reset back to 1500 for everyone. Surfaced as Achievement-shaped
// entries (see rank-tier.ts) so a top-3 finish shows up in the same profile
// achievements grid as everything else, instead of needing its own section —
// always achieved:true since a row only exists here if it was actually earned.
export async function getPlayerSeasonAchievements(userId: string): Promise<Achievement[]> {
  const standings = await prisma.seasonStanding.findMany({
    where: { userId, rank: { lte: 3 } },
    orderBy: { season: { startsAt: "desc" } },
    include: { season: { select: { name: true } } },
  });
  return standings.map((s) => ({
    id: `season-${s.seasonId}-rank${s.rank}`,
    label: `${PLACEMENT_MEDAL[s.rank - 1]} ${s.season.name} ${PLACEMENT_LABEL[s.rank - 1]}`,
    description: `Finished rank ${s.rank} of ${s.season.name}, final rating ${s.finalRating}.`,
    achieved: true,
  }));
}

export async function getSeasonStandings(seasonId: string) {
  return prisma.seasonStanding.findMany({
    where: { seasonId },
    orderBy: { rank: "asc" },
    include: { user: { select: { id: true, username: true } } },
  });
}

// Matches still open at rollover would otherwise get stamped with the *new*
// season's id and Elo'd against the post-reset 1500 baseline the moment
// they're confirmed (seasonId and rating are both read fresh at confirm
// time — see applyEloAndConfirm) — silently corrupting the new season's
// opening ratings with a result that started under the old one. Cancelling
// them here, in the same transaction as the reset, closes that window
// completely. No cancelCount/wired-trust impact either side — same as
// requestMutualCancel, this isn't either player's fault.
async function cancelUnresolvedMatches(tx: Prisma.TransactionClient) {
  const unresolved = await tx.ratingMatch.findMany({
    where: { status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED, MatchStatus.DISPUTED] } },
    select: {
      id: true,
      player1: { select: { discordId: true } },
      player2: { select: { discordId: true } },
    },
  });
  if (unresolved.length === 0) return [];

  await tx.ratingMatch.updateMany({
    where: { id: { in: unresolved.map((m) => m.id) } },
    data: { status: MatchStatus.CANCELLED },
  });
  return unresolved.flatMap((m) => [m.player1.discordId, m.player2.discordId]);
}

// Snapshots the current leaderboard as this season's final standings, then
// resets rating/gamesPlayed for everyone so the next season starts fresh —
// a full reset rather than a soft regression toward the mean, to keep the
// rollover simple and predictable. nextScheduledEndAt announces the next
// season's own rollover time (for its countdown and endActiveSeasonIfDue);
// omit it to leave the next season manual-only, same as before this existed.
export async function endActiveSeasonAndStartNext(
  nextName?: string,
  now = new Date(),
  nextScheduledEndAt?: Date | null,
) {
  const active = await getActiveSeason();
  if (!active) throw new Error("No active season");

  const standings = await prisma.user.findMany({
    where: { gamesPlayed: { gte: LEADERBOARD_MIN_GAMES } },
    orderBy: { rating: "desc" },
    select: { id: true, rating: true, gamesPlayed: true },
  });

  const cancelledMatchDiscordIds = await prisma.$transaction(async (tx) => {
    await tx.season.update({ where: { id: active.id }, data: { endsAt: now } });

    if (standings.length > 0) {
      await tx.seasonStanding.createMany({
        data: standings.map((s, i) => ({
          seasonId: active.id,
          userId: s.id,
          finalRating: s.rating,
          gamesPlayed: s.gamesPlayed,
          rank: i + 1,
        })),
      });
    }

    await tx.user.updateMany({ data: { rating: 1500, gamesPlayed: 0 } });

    const seasonCount = await tx.season.count();
    await tx.season.create({
      data: { name: nextName ?? `Season ${seasonCount + 1}`, startsAt: now, scheduledEndAt: nextScheduledEndAt ?? null },
    });

    return cancelUnresolvedMatches(tx);
  });

  // Promise.all, not sendDiscordDMsSequentially — a rollover only ever
  // catches however many matches were in flight at that moment (a handful at
  // most in practice), not the large bulk lists that helper's rate-limiting
  // delay exists for.
  await Promise.all(
    cancelledMatchDiscordIds.map((discordId) =>
      sendDiscordDM(
        discordId,
        `🔄 Your in-progress match was cancelled — "${active.name}" just ended and ratings reset for the new season. No rating impact either way.`,
      ),
    ),
  );
}

// Polled from the cron route on every tick. Fires the moment the active
// season's announced scheduledEndAt passes — false (no-op) for a season with
// no scheduledEndAt, which stays fully manual via the admin Seasons page.
export async function endActiveSeasonIfDue(now = new Date()) {
  const active = await getActiveSeason();
  if (!active?.scheduledEndAt || now < active.scheduledEndAt) return false;
  // The generic `Season ${count + 1}` default counts the preseason itself,
  // which would otherwise land on "Season 2" for the first real season —
  // named explicitly here so the one auto-triggered rollover anyone's likely
  // to actually see unattended still reads right.
  const nextName = active.name === PRE_SEASON_NAME ? "Season 1" : undefined;
  await endActiveSeasonAndStartNext(nextName, now);
  return true;
}

// Polled from the cron route on every tick. Whatever season was active
// beforehand (dev testing, pre-season tinkering) gets closed out and
// snapshotted like a normal season rollover the moment pre-season
// officially launches, so ratings/games-played reset to a clean slate for
// everyone right on schedule — no manual step needed.
// Idempotent: once the active season's startsAt is at/after
// PRE_SEASON_STARTS_AT, there's nothing left to launch.
export async function launchPreSeasonIfDue(now = new Date()) {
  if (now < PRE_SEASON_STARTS_AT) return false;
  const active = await getActiveSeason();
  if (active) {
    if (active.startsAt >= PRE_SEASON_STARTS_AT) return false;
    await endActiveSeasonAndStartNext(PRE_SEASON_NAME, now);
  } else {
    await prisma.season.create({ data: { name: PRE_SEASON_NAME, startsAt: now } });
  }
  return true;
}
