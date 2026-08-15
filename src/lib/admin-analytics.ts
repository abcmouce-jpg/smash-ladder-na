import { prisma } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";

// Raw timestamps for the day-bucketed charts — bucketing happens client-side
// (see TimeSeriesChart) so day boundaries follow the viewer's timezone, same
// reasoning as getMatchesPerDay in public-stats.ts.
export async function getSignupsPerDay(days = 90) {
  const since = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000);
  const users = await prisma.user.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return users.map((u) => u.createdAt.toISOString());
}

// CANCELLED status matches are created and then cancelled, almost always
// within minutes (see CANCEL_GRACE_PERIOD_SECONDS in lib/matches.ts) — using
// createdAt as the bucket key is a reasonable proxy for "when this cancel
// happened" without needing a separate cancelledAt column.
export async function getCancelsPerDay(days = 90) {
  const since = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000);
  const matches = await prisma.ratingMatch.findMany({
    where: { status: MatchStatus.CANCELLED, createdAt: { gte: since } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return matches.map((m) => m.createdAt.toISOString());
}

export async function getDisputesPerDay(days = 90) {
  const since = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000);
  const games = await prisma.matchGame.findMany({
    where: { disputeRequestedAt: { gte: since } },
    select: { disputeRequestedAt: true },
    orderBy: { disputeRequestedAt: "asc" },
  });
  return games
    .filter((g): g is { disputeRequestedAt: Date } => g.disputeRequestedAt !== null)
    .map((g) => g.disputeRequestedAt.toISOString());
}

// Currently-active snapshots — lastSignInAt only ever holds the most recent
// sign-in (see admin-stats.ts's own comment on it), so unlike the charts
// above this can't be reconstructed as a historical trend from existing
// data; these are point-in-time counts as of right now.
export async function getActiveUserSnapshot() {
  const now = Date.now();
  const [last24h, last7d, last30d] = await Promise.all([
    prisma.user.count({ where: { lastSignInAt: { gte: new Date(now - 1 * 86_400_000) } } }),
    prisma.user.count({ where: { lastSignInAt: { gte: new Date(now - 7 * 86_400_000) } } }),
    prisma.user.count({ where: { lastSignInAt: { gte: new Date(now - 30 * 86_400_000) } } }),
  ]);
  return { last24h, last7d, last30d };
}

type RetentionRow = { cohort_week: Date; cohort_size: bigint; retained: bigint };

// A user counts as "retained" if they played a 2nd ranked match (any
// resolution — CONFIRMED/CANCELLED/etc. all show real engagement, unlike a
// pure signup) within 7 days of their own signup. One raw query rather than
// N+1 per-user lookups — cohorting and the 7-day join both push past what
// Prisma's query builder does cleanly, and this only ever reads, so a raw
// SQL query here doesn't carry the write-path risk that ad-hoc production
// SQL has elsewhere in this app.
async function retentionByCohort(weeks: number, referredOnly: boolean | null) {
  const referralFilter =
    referredOnly === null ? "" : referredOnly ? 'AND u."referredById" IS NOT NULL' : 'AND u."referredById" IS NULL';

  return prisma.$queryRawUnsafe<RetentionRow[]>(`
    WITH cohorts AS (
      SELECT
        u.id,
        date_trunc('week', u."createdAt") AS cohort_week,
        EXISTS (
          SELECT 1 FROM "RatingMatch" m
          WHERE (m."player1Id" = u.id OR m."player2Id" = u.id)
            AND m."createdAt" > u."createdAt"
            AND m."createdAt" <= u."createdAt" + interval '7 days'
        ) AS retained
      FROM "User" u
      WHERE u."createdAt" >= now() - (interval '1 week' * $1)
        ${referralFilter}
    )
    SELECT cohort_week, count(*) AS cohort_size, count(*) FILTER (WHERE retained) AS retained
    FROM cohorts
    GROUP BY cohort_week
    ORDER BY cohort_week ASC
  `, weeks);
}

export async function getWeeklyRetentionCohorts(weeks = 8) {
  const rows = await retentionByCohort(weeks, null);
  return rows.map((r) => ({
    weekStart: r.cohort_week.toISOString(),
    cohortSize: Number(r.cohort_size),
    retained: Number(r.retained),
  }));
}

// Compares the SAME 7-day-2nd-match definition above across referred vs
// organic signups — a direct read on whether the referral program is
// actually producing stickier players, not just more signups.
export async function getReferralRetentionComparison(weeks = 12) {
  const [referred, organic] = await Promise.all([
    retentionByCohort(weeks, true),
    retentionByCohort(weeks, false),
  ]);
  const sum = (rows: RetentionRow[]) => ({
    cohortSize: rows.reduce((n, r) => n + Number(r.cohort_size), 0),
    retained: rows.reduce((n, r) => n + Number(r.retained), 0),
  });
  return { referred: sum(referred), organic: sum(organic) };
}

type RatingGapRow = { faced_big_gap: boolean; cohort_size: bigint; churned: bigint };

// Hypothesis this backs: new players who get stomped by a much stronger
// opponent early quit more than ones who don't. "Early" = first 3 matches by
// createdAt; "stomped" = faced an opponent rated 200+ above their own
// rating-before-that-match; "churned" = no sign-in in the last 30 days,
// among players who'd played at least one match (never-played signups are a
// separate activation problem, not churn).
export async function getRatingGapChurnAnalysis() {
  const rows = await prisma.$queryRawUnsafe<RatingGapRow[]>(`
    WITH first_matches AS (
      SELECT
        m.id,
        m."player1Id" AS user_id,
        m."player2RatingBefore" - m."player1RatingBefore" AS gap,
        row_number() OVER (PARTITION BY m."player1Id" ORDER BY m."createdAt" ASC) AS n
      FROM "RatingMatch" m
      WHERE m."player1RatingBefore" IS NOT NULL AND m."player2RatingBefore" IS NOT NULL
      UNION ALL
      SELECT
        m.id,
        m."player2Id" AS user_id,
        m."player1RatingBefore" - m."player2RatingBefore" AS gap,
        row_number() OVER (PARTITION BY m."player2Id" ORDER BY m."createdAt" ASC) AS n
      FROM "RatingMatch" m
      WHERE m."player1RatingBefore" IS NOT NULL AND m."player2RatingBefore" IS NOT NULL
    ),
    per_user AS (
      SELECT user_id, bool_or(gap >= 200) AS faced_big_gap
      FROM first_matches
      WHERE n <= 3
      GROUP BY user_id
    )
    SELECT
      p.faced_big_gap,
      count(*) AS cohort_size,
      count(*) FILTER (WHERE u."lastSignInAt" IS NULL OR u."lastSignInAt" < now() - interval '30 days') AS churned
    FROM per_user p
    JOIN "User" u ON u.id = p.user_id
    WHERE u."gamesPlayed" >= 1
    GROUP BY p.faced_big_gap
  `);

  const bigGap = rows.find((r) => r.faced_big_gap);
  const noBigGap = rows.find((r) => !r.faced_big_gap);
  return {
    facedBigGap: bigGap
      ? { cohortSize: Number(bigGap.cohort_size), churned: Number(bigGap.churned) }
      : { cohortSize: 0, churned: 0 },
    noBigGap: noBigGap
      ? { cohortSize: Number(noBigGap.cohort_size), churned: Number(noBigGap.churned) }
      : { cohortSize: 0, churned: 0 },
  };
}
