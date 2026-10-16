// Who actually uses the ladder the most?
//
// "Most" has more than one honest answer, so this reports three and lets them
// disagree:
//
//   sets   - confirmed sets played all time. The headline number, but it
//            rewards one marathon night as much as a year of showing up.
//   days   - distinct calendar days (in LADDER_TIME_ZONE) with at least one
//            confirmed set. The closest thing to "keeps coming back".
//   joins  - RatingLobbyEntry rows: every time they sat in the queue, whether
//            or not it produced a match. Someone with far more joins than sets
//            is waiting in an empty queue, which is a different kind of heavy
//            user and a different problem.
//
// Deleted accounts (the row survives deleteMyAccount with status ACTIVE) and
// the dev/practice fixtures are excluded, same as the campaign scripts.
//
//   npx tsx scripts/top-users.ts [--limit 10]
import { prisma } from "../src/lib/db";
import { LADDER_TIME_ZONE } from "../src/lib/timezone";
import { getActiveSeason } from "../src/lib/seasons";
import { DELETED_USERNAME } from "../src/lib/account";

type Row = {
  username: string;
  discord_username: string | null;
  sets: number;
  season_sets: number;
  days: number;
  joins: number;
  opponents: number;
  first_set: Date;
  last_set: Date;
  rating: number;
  last_sign_in: Date | null;
};

function value(name: string, fallback: number) {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const parsed = Number(process.argv[at + 1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function day(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "     -    ";
}

function table(label: string, rows: Row[]) {
  console.log(`\n${label}`);
  console.log("  #  player                 sets  season  days  joins  opp   first played  last played");
  rows.forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)} ${r.username.slice(0, 20).padEnd(21)}` +
        `${String(r.sets).padStart(5)}  ${String(r.season_sets).padStart(6)}  ${String(r.days).padStart(4)}  ` +
        `${String(r.joins).padStart(5)}  ${String(r.opponents).padStart(3)}   ${day(r.first_set)}    ${day(r.last_set)}`,
    );
  });
}

async function main() {
  const limit = value("limit", 10);
  const season = await getActiveSeason();
  const seasonStart = season?.startsAt ?? new Date(0);

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `
    WITH real_users AS (
      SELECT id, username, "discordUsername", rating, "lastSignInAt"
      FROM "User"
      WHERE username <> $1
        AND "discordId" NOT LIKE 'deleted-%'
        AND "discordId" NOT LIKE 'dev-%'
        AND "discordId" NOT LIKE 'practice-%'
    ),
    sides AS (
      SELECT "player1Id" AS uid, "player2Id" AS foe, "confirmedAt" FROM "RatingMatch" WHERE status = 'CONFIRMED'
      UNION ALL
      SELECT "player2Id" AS uid, "player1Id" AS foe, "confirmedAt" FROM "RatingMatch" WHERE status = 'CONFIRMED'
    ),
    play AS (
      SELECT uid,
             COUNT(*)::int AS sets,
             COUNT(*) FILTER (WHERE "confirmedAt" >= $2)::int AS season_sets,
             COUNT(DISTINCT (("confirmedAt" AT TIME ZONE 'UTC') AT TIME ZONE $3)::date)::int AS days,
             COUNT(DISTINCT foe)::int AS opponents,
             MIN("confirmedAt") AS first_set,
             MAX("confirmedAt") AS last_set
      FROM sides GROUP BY uid
    ),
    queue AS (
      SELECT "userId" AS uid, COUNT(*)::int AS joins FROM "RatingLobbyEntry" GROUP BY "userId"
    )
    SELECT u.username, u."discordUsername" AS discord_username,
           p.sets, p.season_sets, p.days, p.opponents,
           COALESCE(q.joins, 0)::int AS joins,
           p.first_set, p.last_set, u.rating, u."lastSignInAt" AS last_sign_in
    FROM play p
    JOIN real_users u ON u.id = p.uid
    LEFT JOIN queue q ON q.uid = p.uid
    `,
    DELETED_USERNAME,
    seasonStart,
    LADDER_TIME_ZONE,
  );

  // Not sum(sets)/2: a match with one excluded side (deleted account, dev
  // fixture) contributes a single row above, so halving would undercount.
  const [totals] = await prisma.$queryRawUnsafe<{ matches: number; site_days: number }[]>(
    `SELECT COUNT(*)::int AS matches,
            COUNT(DISTINCT (("confirmedAt" AT TIME ZONE 'UTC') AT TIME ZONE $1)::date)::int AS site_days
       FROM "RatingMatch" WHERE status = 'CONFIRMED'`,
    LADDER_TIME_ZONE,
  );
  console.log(`season       : ${season?.name ?? "(none active)"} (from ${seasonStart.toISOString().slice(0, 10)})`);
  console.log(`players with at least one confirmed set: ${rows.length}`);
  console.log(`confirmed sets site-wide: ${totals.matches} over ${totals.site_days} days with play`);
  console.log(`day key timezone: ${LADDER_TIME_ZONE}`);

  const bySets = [...rows].sort((a, b) => b.sets - a.sets).slice(0, limit);
  const byDays = [...rows].sort((a, b) => b.days - a.days || b.sets - a.sets).slice(0, limit);
  const byJoins = [...rows].sort((a, b) => b.joins - a.joins).slice(0, limit);
  const bySeason = [...rows].sort((a, b) => b.season_sets - a.season_sets).slice(0, limit);

  table("most sets, all time", bySets);
  table("most distinct days played (keeps coming back)", byDays);
  table("most queue joins (includes waits that never matched)", byJoins);
  table(`most sets this season (${season?.name ?? "-"})`, bySeason);

  // A heavy user whose joins dwarf their sets is sitting in an empty queue.
  const waiting = [...rows]
    .filter((r) => r.joins >= 20 && r.sets > 0)
    .map((r) => ({ ...r, ratio: r.joins / r.sets }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 5);
  if (waiting.length) {
    console.log("\nqueued far more often than they got a match (joins per set, min 20 joins):");
    for (const r of waiting) {
      console.log(`  ${r.username.slice(0, 20).padEnd(21)} ${r.ratio.toFixed(1)}x  (${r.joins} joins, ${r.sets} sets)`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
