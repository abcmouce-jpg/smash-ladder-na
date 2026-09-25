import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { MatchStatus, RatingAlgorithm } from "@/generated/prisma/enums";
import { DELETED_USERNAME } from "@/lib/account";
import { sendDiscordDM } from "@/lib/discord-bot";
import { GLICKO2_INITIAL_RATING, GLICKO2_INITIAL_RD, GLICKO2_INITIAL_VOLATILITY } from "@/lib/glicko2";
import { formatRating } from "@/lib/rating-format";
import { LEADERBOARD_MIN_GAMES, type Achievement } from "@/lib/rank-tier";

// Pre-season launch announcement, shown site-wide until this passes.
// -04:00 is ET's summer (EDT) offset — update if this ever needs to move
// past a DST boundary.
export const PRE_SEASON_STARTS_AT = new Date("2026-07-25T18:00:00-04:00");

export const PRE_SEASON_NAME = "Preseason";

// Every season runs a fixed 2 months. A newly created season is stamped with
// scheduledEndAt = start + SEASON_DURATION_MONTHS, so the finalize cron rolls
// it over on its own with no manual step (see endActiveSeasonIfDue).
export const SEASON_DURATION_MONTHS = 2;

// The preseason runs the same fixed length as any other season; kept as its
// own name because the preseason copy on the leaderboard/rules pages reads it
// that way.
export const PRE_SEASON_DURATION_MONTHS = SEASON_DURATION_MONTHS;

// The preseason's announced end, pinned to 2pm ET on the day that 2 months out
// lands rather than deriving it from PRE_SEASON_STARTS_AT's own 6pm ET time of
// day. Used as the preseason's scheduledEndAt (see launchPreSeasonIfDue).
export const PRE_SEASON_EXPECTED_END_AT = new Date("2026-09-25T14:00:00-04:00");

// Whole-month arithmetic that keeps the day-of-month and time of day, clamping
// to the target month's last day (Jan 31 + 1 month → Feb 28) instead of letting
// Date roll over into the following month.
export function addMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const shifted = new Date(date);
  shifted.setUTCDate(1); // park on the 1st so the month shift can't overflow
  shifted.setUTCMonth(shifted.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return shifted;
}

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

// Which rating system a newly-started season runs on. Every season created from
// here on starts fresh on Glicko-2 (see endActiveSeasonAndStartNext); a season
// that's already running keeps whatever its own `algorithm` column says, so
// this never rewrites the current season. Flip back to ELO to make the next
// rollover produce an Elo season again.
export const NEXT_SEASON_ALGORITHM = RatingAlgorithm.GLICKO2;

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
// The preseason gets one more on top: EVERY standing row, not just top-3, is
// also a "Preseason Participant" badge — being there for the very first one
// is worth commemorating regardless of where you placed, unlike a normal
// season's rank medals.
export async function getPlayerSeasonAchievements(userId: string): Promise<Achievement[]> {
  const standings = await prisma.seasonStanding.findMany({
    where: { userId, OR: [{ rank: { lte: 3 } }, { season: { name: PRE_SEASON_NAME } }] },
    orderBy: { season: { startsAt: "desc" } },
    include: { season: { select: { name: true } } },
  });

  const achievements: Achievement[] = [];
  for (const s of standings) {
    if (s.rank <= 3) {
      achievements.push({
        id: `season-${s.seasonId}-rank${s.rank}`,
        label: `${PLACEMENT_MEDAL[s.rank - 1]} ${s.season.name} ${PLACEMENT_LABEL[s.rank - 1]}`,
        description: `Finished rank ${s.rank} of ${s.season.name}, final rating ${formatRating(s.finalRating)}.`,
        achieved: true,
      });
    }
    if (s.season.name === PRE_SEASON_NAME) {
      achievements.push({
        id: `season-${s.seasonId}-preseason-participant`,
        label: "Preseason Participant",
        description: "Played enough ranked sets during the Preseason to make the final standings.",
        achieved: true,
      });
    }
  }
  return achievements;
}

// Standings can run long (the preseason snapshots everyone who cleared the
// games-played floor), so the archive page pages through them. `totalCount`
// comes back alongside the page so the pager can render without a second
// count query in the caller. Rows are written once at rollover and never
// touched again, so a concurrent write splitting the two queries isn't a
// concern here. Excludes deleted accounts — same as the live leaderboard —
// so a self-deletion doesn't leave a dangling "Deleted User" row sitting in
// a historical top finish.
export async function getSeasonStandings(seasonId: string, pagination: { skip?: number; take?: number } = {}) {
  const where = { seasonId, user: { username: { not: DELETED_USERNAME } } };
  const [standings, totalCount] = await Promise.all([
    prisma.seasonStanding.findMany({
      where,
      orderBy: { rank: "asc" },
      include: { user: { select: { id: true, username: true } } },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.seasonStanding.count({ where }),
  ]);

  return { standings, totalCount };
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
// resets rating/gamesPlayed (and the parallel practiceRating/practiceGamesPlayed
// track) for everyone so the next season starts fresh — a full reset rather
// than a soft regression toward the mean, to keep the rollover simple and
// predictable. Every season runs a fixed 2 months, so by default the next
// season is stamped with a rollover time of `now` + SEASON_DURATION_MONTHS and
// keeps rolling over on its own. Pass nextScheduledEndAt to override that
// length for a deliberate one-off, or null to leave the next season
// manual-only. nextAlgorithm is stamped onto the new season and defaults to
// NEXT_SEASON_ALGORITHM (Glicko-2).
export async function endActiveSeasonAndStartNext(
  nextName?: string,
  now = new Date(),
  nextScheduledEndAt?: Date | null,
  nextAlgorithm: RatingAlgorithm = NEXT_SEASON_ALGORITHM,
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

    // A fresh start: rating back to the 1500 baseline, and Glicko-2 state back
    // to maximum uncertainty so everyone begins the new season unrated. Elo
    // ignores rd/volatility, so resetting them here is harmless for an Elo
    // season and exactly right for the Glicko-2 one starting below.
    await tx.user.updateMany({
      data: {
        rating: GLICKO2_INITIAL_RATING,
        ratingDeviation: GLICKO2_INITIAL_RD,
        ratingVolatility: GLICKO2_INITIAL_VOLATILITY,
        gamesPlayed: 0,
        practiceRating: GLICKO2_INITIAL_RATING,
        practiceRatingDeviation: GLICKO2_INITIAL_RD,
        practiceRatingVolatility: GLICKO2_INITIAL_VOLATILITY,
        practiceGamesPlayed: 0,
      },
    });

    const seasonCount = await tx.season.count();
    await tx.season.create({
      data: {
        name: nextName ?? `Season ${seasonCount + 1}`,
        startsAt: now,
        // Omitted → the standard 2-month season; explicit null → manual-only.
        scheduledEndAt: nextScheduledEndAt === undefined ? addMonths(now, SEASON_DURATION_MONTHS) : nextScheduledEndAt,
        algorithm: nextAlgorithm,
      },
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
//
// The preseason is scheduled to end at PRE_SEASON_EXPECTED_END_AT (passed as
// nextScheduledEndAt / scheduledEndAt below) so endActiveSeasonIfDue rolls it
// over on its own — the same announced-length mechanism every other season
// uses. Without it the preseason would be manual-only and sit past its
// announced end until someone ended it by hand.
export async function launchPreSeasonIfDue(now = new Date()) {
  if (now < PRE_SEASON_STARTS_AT) return false;
  const active = await getActiveSeason();
  if (active) {
    if (active.startsAt >= PRE_SEASON_STARTS_AT) return false;
    // The preseason stays on Elo regardless of NEXT_SEASON_ALGORITHM — it's a
    // fixed trial run whose framing predates Glicko-2, and the Glicko-2 season
    // that follows it is created by the normal rollover path below.
    await endActiveSeasonAndStartNext(PRE_SEASON_NAME, now, PRE_SEASON_EXPECTED_END_AT, RatingAlgorithm.ELO);
  } else {
    await prisma.season.create({
      data: { name: PRE_SEASON_NAME, startsAt: now, scheduledEndAt: PRE_SEASON_EXPECTED_END_AT },
    });
  }
  return true;
}
