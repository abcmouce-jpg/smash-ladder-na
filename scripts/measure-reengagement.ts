// Did the Season 1 win-back DM actually bring anyone back?
//
// The honest version of that question needs a comparison group, because
// dormant players sometimes return on their own and counting only the people
// who were messaged would credit the DM for all of it. Three cohorts, all
// dormant at the moment the campaign ran:
//
//   delivered  - stamped reengagedAt and NOT in the blocked list: the DM landed
//   blocked    - stamped, but Discord refused the DM (recipient has DMs from
//                server members turned off). Same community-server membership,
//                same dormancy, same send order — the closest thing to a
//                control this campaign has, though n is small and someone who
//                locks down their DMs may simply be a different kind of user.
//   no_contact - dormant and never stamped, because they share no server with
//                the bot and were filtered out before sending. Large n, but
//                confounded: not being in the community server is itself a
//                sign of lower engagement, so this cohort would be expected to
//                return at a lower rate even with no campaign at all. Read it
//                as a floor, not as a matched control.
//
// The DB does not record per-recipient delivery (sent and blocked both keep the
// stamp), so the blocked ids come from the run logs and are passed in via
// --blocked-file.
//
// Usage:
//   npx tsx scripts/measure-reengagement.ts --blocked-file /path/to/blocked_all.txt
//   npx tsx scripts/measure-reengagement.ts --blocked-file ... --since '2026-10-14 20:55'
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { getActiveSeason } from "../src/lib/seasons";
import { MatchStatus, UserStatus } from "../src/generated/prisma/enums";
import { DELETED_USERNAME } from "../src/lib/account";

// When the campaign started sending. Anyone in the no_contact cohort has no
// per-user stamp to measure from, so they are measured against this instead.
const DEFAULT_CAMPAIGN_START = "2026-10-14 20:55:00";

function arg(name: string) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

type Row = {
  id: string;
  discordId: string;
  reengagedAt: Date | null;
  playedAfter: number;
};

function pct(part: number, whole: number) {
  return whole === 0 ? "   n/a" : `${((100 * part) / whole).toFixed(1).padStart(5)}%`;
}

function report(label: string, rows: Row[]) {
  const returned = rows.filter((r) => r.playedAfter > 0);
  const sets = returned.reduce((sum, r) => sum + r.playedAfter, 0);
  console.log(
    `  ${label.padEnd(11)} n=${String(rows.length).padStart(5)}   returned=${String(returned.length).padStart(4)}` +
      `  (${pct(returned.length, rows.length)})   sets played=${String(sets).padStart(4)}`,
  );
  return { n: rows.length, returned: returned.length };
}

async function main() {
  const blockedFile = arg("blocked-file");
  if (!blockedFile) {
    console.error("--blocked-file is required (one Discord id per line, from the run logs).");
    process.exitCode = 1;
    return;
  }
  const blocked = new Set(
    readFileSync(blockedFile, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );

  const season = await getActiveSeason();
  if (!season) return;
  const campaignStart = new Date(arg("since") ?? DEFAULT_CAMPAIGN_START);

  // Everyone who was dormant when the campaign ran: played at some point, but
  // nothing between the season opening and the campaign going out. Restricting
  // the "no set" window to BEFORE the campaign is what makes a return
  // measurable — the lib's own predicate would exclude anyone who has since
  // come back, which is precisely the population being counted here.
  const candidates = await prisma.user.findMany({
    where: {
      status: UserStatus.ACTIVE,
      username: { not: DELETED_USERNAME },
      OR: [
        { matchesAsP1: { some: { status: MatchStatus.CONFIRMED } } },
        { matchesAsP2: { some: { status: MatchStatus.CONFIRMED } } },
      ],
      NOT: {
        OR: [
          {
            matchesAsP1: {
              some: {
                status: MatchStatus.CONFIRMED,
                confirmedAt: { gte: season.startsAt, lt: campaignStart },
              },
            },
          },
          {
            matchesAsP2: {
              some: {
                status: MatchStatus.CONFIRMED,
                confirmedAt: { gte: season.startsAt, lt: campaignStart },
              },
            },
          },
          { discordId: { startsWith: "deleted-" } },
          { discordId: { startsWith: "dev-" } },
          { discordId: { startsWith: "practice-" } },
        ],
      },
    },
    select: {
      id: true,
      discordId: true,
      reengagedAt: true,
      notificationsDisabled: true,
      _count: {
        select: {
          matchesAsP1: { where: { status: MatchStatus.CONFIRMED, confirmedAt: { gte: campaignStart } } },
          matchesAsP2: { where: { status: MatchStatus.CONFIRMED, confirmedAt: { gte: campaignStart } } },
        },
      },
    },
  });

  const rows: Row[] = candidates
    .filter((u) => !u.notificationsDisabled.includes("DM_SEASON_ROLLOVER"))
    .map((u) => ({
      id: u.id,
      discordId: u.discordId,
      reengagedAt: u.reengagedAt,
      playedAfter: u._count.matchesAsP1 + u._count.matchesAsP2,
    }));

  const contacted = rows.filter((r) => r.reengagedAt !== null && r.reengagedAt >= season.startsAt);
  const delivered = contacted.filter((r) => !blocked.has(r.discordId));
  const refused = contacted.filter((r) => blocked.has(r.discordId));
  const noContact = rows.filter((r) => r.reengagedAt === null);

  const hours = ((Date.now() - campaignStart.getTime()) / 3_600_000).toFixed(1);
  console.log(`season   : ${season.name}`);
  console.log(`campaign : ${campaignStart.toISOString()}  (${hours} h ago)`);
  console.log(`blocked list: ${blocked.size} ids\n`);
  console.log("cohorts (all were dormant when the campaign ran):");
  const d = report("delivered", delivered);
  const b = report("blocked", refused);
  const n = report("no_contact", noContact);

  console.log("\nread:");
  if (d.n === 0) {
    console.log("  nothing stamped yet — has the campaign run?");
    return;
  }
  const lift = (100 * d.returned) / d.n - (100 * n.returned) / Math.max(n.n, 1);
  console.log(`  delivered vs no_contact: ${lift >= 0 ? "+" : ""}${lift.toFixed(1)} points`);
  if (b.n < 100) {
    console.log(
      `  the blocked cohort is only n=${b.n}, so treat its rate as indicative, not conclusive —` +
        " a handful of players either way swings it by whole percentage points.",
    );
  }
  console.log(
    "  no_contact is not a matched control: those players share no server with the bot,\n" +
      "  which is itself a sign of lower engagement. The gap is an upper bound on the DM's effect.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
