// The second (and last) victim of the track-blind cancel rollback — see
// scripts/fix-butterkix-track-rollback.ts for the full story of the bug and
// disputes.ts adminCancelMatch for the fix.
//
// 2026-10-06 01:02: splitsteam played a PRACTICE set
// (cmuvz4kgv000305s43ooqzzoo, player1IsPracticing = true) that was confirmed
// by auto-timeout and then cancelled. adminCancelMatch restored the practice
// snapshots onto the MAIN columns, so the ladder rating went 1509.67 -> 1088.62
// and gamesPlayed was decremented on a track the set never touched.
//
// Unlike Butterkix's case, the rating is NOT corrected here. 97 confirmed
// ladder sets against 70 distinct opponents were rated against the deflated
// number before it climbed back past 1509.67 on 2026-10-20, and every one of
// those opponents' later sets built on the result. Replaying that is a
// ladder-wide recompute, not a one-off repair, and Glicko-2 has since
// re-converged on its own (1592.22 at RD 64.13, above where the dip started).
// A flat +421 shift today would invent a rating no result ever supported.
//
// What is still plainly wrong and safely fixable is the set counter: the
// decrement came off a track the set was never on. 203 confirmed main-track
// sets exist for splitsteam in Season 1; gamesPlayed says 202.
//
// Usage (dry run prints the change and writes nothing):
//   npx tsx scripts/fix-splitsteam-games-played.ts
//   npx tsx scripts/fix-splitsteam-games-played.ts --apply
import { prisma } from "../src/lib/db";
import { MatchMode, MatchStatus } from "../src/generated/prisma/enums";

const SPLITSTEAM = "cmtrpx9c4000504jx2eo8w41c";

const apply = process.argv.includes("--apply");

async function main() {
  const season = await prisma.season.findFirstOrThrow({ where: { endsAt: null }, orderBy: { startsAt: "desc" } });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: SPLITSTEAM },
    select: { username: true, gamesPlayed: true },
  });

  // The same count the counter is meant to track: confirmed, main-track,
  // this season. Rebuilt rather than blindly +1'd, so a second stray
  // decrement would be caught too.
  const real = await prisma.ratingMatch.count({
    where: {
      status: MatchStatus.CONFIRMED,
      seasonId: season.id,
      mode: { not: MatchMode.RANDITTO },
      OR: [
        { player1Id: SPLITSTEAM, player1IsPracticing: false },
        { player2Id: SPLITSTEAM, player2IsPracticing: false },
      ],
    },
  });

  console.log(`${user.username}: gamesPlayed ${user.gamesPlayed} -> ${real}`);

  if (user.gamesPlayed === real) {
    console.log("Already correct, nothing to do.");
    return;
  }
  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write.");
    return;
  }

  await prisma.user.update({ where: { id: SPLITSTEAM }, data: { gamesPlayed: real } });
  console.log("\nApplied.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
