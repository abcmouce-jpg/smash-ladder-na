// One-off repair for the track-blind cancel rollback (see disputes.ts
// adminCancelMatch, fixed in the same change as this script).
//
// What happened, 2026-11-11: Butterkix played a PRACTICE set
// (cmwcosiqm001x08kzxl5adyum, player1IsPracticing = true), it confirmed, and
// was then cancelled. adminCancelMatch restored `rating`/`ratingDeviation`/
// `ratingVolatility` and decremented `gamesPlayed` — the MAIN track columns —
// from that set's practice-track snapshots, so the ladder rating became the
// practice track's untouched 1500/350 and the real 2163.43/88.215 was lost.
// The next ladder set (cmwcph2zz004v07l8vwgm0yz7) then built on 1500/350 and
// produced 1666.21 instead of the right number.
//
// This script:
//   1. recomputes that next set from Butterkix's real pre-set state, aged for
//      inactivity exactly as applyEloAndConfirm would have;
//   2. writes the corrected state back (rating, rd, volatility, gamesPlayed)
//      and the corrected snapshots on the match row and RatingHistory;
//   3. puts the practice track back to untouched (the cancelled set should
//      never have left a mark there either).
//
// The opponent of that next set has played five more sets since, so their
// rating is corrected by the DIFFERENCE between the old and new post-set
// numbers rather than overwritten — the same relative-delta approach
// adminUndoOldMatch uses once a chain has moved on. Their rd/volatility are
// left alone: five later sets have already built on them and there is no
// honest relative correction for those.
//
// Usage (dry run prints every change and writes nothing):
//   DATABASE_URL=... DATABASE_URL_POOLED=... npx tsx scripts/fix-butterkix-track-rollback.ts
//   DATABASE_URL=... DATABASE_URL_POOLED=... npx tsx scripts/fix-butterkix-track-rollback.ts --apply
import { prisma } from "../src/lib/db";
import {
  applyGlicko2Inactivity,
  applyGlicko2Result,
  glicko2InactivityPeriods,
  GLICKO2_INITIAL_RATING,
  GLICKO2_INITIAL_RD,
  GLICKO2_INITIAL_VOLATILITY,
} from "../src/lib/glicko2";
import { MatchStatus, MatchMode } from "../src/generated/prisma/enums";

// matches.ts's MIN_RATING_DELTA, restated rather than imported: importing it
// pulls the whole match module (and with it the push/webhook clients, which
// initialise at import time) into a script that only needs the number.
const MIN_RATING_DELTA = 1;

const BUTTERKIX = "cmsfise9y000204l43j9ixtse";
const CANCELLED_PRACTICE_SET = "cmwcosiqm001x08kzxl5adyum";
const NEXT_LADDER_SET = "cmwcph2zz004v07l8vwgm0yz7";

const apply = process.argv.includes("--apply");
const n = (x: number) => x.toFixed(4);

async function main() {
  const set = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: NEXT_LADDER_SET } });
  if (set.player1Id !== BUTTERKIX) throw new Error("expected Butterkix as player1 of the ladder set");
  if (set.status !== MatchStatus.CONFIRMED || !set.confirmedAt) throw new Error("ladder set is not confirmed");
  if (set.reportedWinnerId !== BUTTERKIX) throw new Error("expected Butterkix to be the recorded winner");
  if (set.player2RatingBefore === null || set.player2RdBefore === null || set.player2VolatilityBefore === null) {
    throw new Error("opponent's pre-set snapshot is missing");
  }
  if (set.player1RatingAfter === null || set.player2RatingAfter === null) {
    throw new Error("post-set snapshot is missing");
  }

  // Butterkix's real ladder state going into the set: the post-set state of
  // their last CONFIRMED main-track set before it, which is what
  // applyEloAndConfirm would have read had the cancel not overwritten it.
  const prior = await prisma.ratingMatch.findFirst({
    where: {
      id: { not: NEXT_LADDER_SET },
      status: MatchStatus.CONFIRMED,
      confirmedAt: { not: null, lt: set.confirmedAt },
      mode: MatchMode.STANDARD,
      OR: [
        { player1Id: BUTTERKIX, player1IsPracticing: false },
        { player2Id: BUTTERKIX, player2IsPracticing: false },
      ],
    },
    orderBy: { confirmedAt: "desc" },
  });
  if (!prior?.confirmedAt) throw new Error("no prior main-track set to restore from");
  const asP1 = prior.player1Id === BUTTERKIX;
  const restored = {
    rating: (asP1 ? prior.player1RatingAfter : prior.player2RatingAfter) as number,
    rd: (asP1 ? prior.player1RdAfter : prior.player2RdAfter) as number,
    volatility: (asP1 ? prior.player1VolatilityAfter : prior.player2VolatilityAfter) as number,
  };
  if ([restored.rating, restored.rd, restored.volatility].some((v) => typeof v !== "number")) {
    throw new Error("prior set has no Glicko-2 snapshot to restore from");
  }

  // Same inactivity ageing applyEloAndConfirm applies: whole 24h periods
  // between the previous main-track confirmation and this one.
  const periods = glicko2InactivityPeriods(set.confirmedAt.getTime() - prior.confirmedAt.getTime());
  const p1Before = applyGlicko2Inactivity(restored, periods);
  const p2Before = {
    rating: set.player2RatingBefore,
    rd: set.player2RdBefore,
    volatility: set.player2VolatilityBefore,
  };

  const next = applyGlicko2Result(p1Before, p2Before, 1);
  // The ±1 floor nextRatingStates puts on both sides (see withMinimumMove).
  const p1After = { ...next.p1, rating: Math.max(next.p1.rating, p1Before.rating + MIN_RATING_DELTA) };
  const p2After = { ...next.p2, rating: Math.min(next.p2.rating, p2Before.rating - MIN_RATING_DELTA) };

  const opponentShift = p2After.rating - set.player2RatingAfter;

  const butterkix = await prisma.user.findUniqueOrThrow({ where: { id: BUTTERKIX } });
  const opponent = await prisma.user.findUniqueOrThrow({ where: { id: set.player2Id } });

  // gamesPlayed lost a point to the same bad rollback (the practice set
  // decremented the ladder counter), so it is rebuilt from the sets that
  // actually count rather than nudged.
  const ladderSets = await prisma.ratingMatch.count({
    where: {
      status: MatchStatus.CONFIRMED,
      seasonId: set.seasonId,
      mode: MatchMode.STANDARD,
      OR: [
        { player1Id: BUTTERKIX, player1IsPracticing: false },
        { player2Id: BUTTERKIX, player2IsPracticing: false },
      ],
    },
  });

  console.log(`inactivity periods applied: ${periods}`);
  console.log(`\n${butterkix.username}`);
  console.log(
    `  pre-set   ${n(restored.rating)} / rd ${n(restored.rd)}  -> aged ${n(p1Before.rating)} / rd ${n(p1Before.rd)}`,
  );
  console.log(`  rating    ${n(butterkix.rating)} -> ${n(p1After.rating)}`);
  console.log(`  rd        ${n(butterkix.ratingDeviation)} -> ${n(p1After.rd)}`);
  console.log(`  vol       ${butterkix.ratingVolatility} -> ${p1After.volatility}`);
  console.log(`  games     ${butterkix.gamesPlayed} -> ${ladderSets}`);
  console.log(
    `  practice  ${n(butterkix.practiceRating)}/${butterkix.practiceGamesPlayed} sets -> ${GLICKO2_INITIAL_RATING}/0 sets`,
  );
  console.log(`\n${opponent.username} (5 later sets, relative correction only)`);
  console.log(
    `  this set  ${n(set.player2RatingAfter)} -> ${n(p2After.rating)}  (${opponentShift >= 0 ? "+" : ""}${n(opponentShift)})`,
  );
  console.log(`  rating    ${n(opponent.rating)} -> ${n(opponent.rating + opponentShift)}`);

  if (!apply) {
    console.log("\nDry run — nothing written. Re-run with --apply.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.ratingMatch.update({
      where: { id: NEXT_LADDER_SET },
      data: {
        player1RatingBefore: p1Before.rating,
        player1RdBefore: p1Before.rd,
        player1VolatilityBefore: p1Before.volatility,
        player1RatingAfter: p1After.rating,
        player1RdAfter: p1After.rd,
        player1VolatilityAfter: p1After.volatility,
        player2RatingAfter: p2After.rating,
        player2RdAfter: p2After.rd,
        player2VolatilityAfter: p2After.volatility,
      },
    });

    await tx.user.update({
      where: { id: BUTTERKIX },
      data: {
        rating: p1After.rating,
        ratingDeviation: p1After.rd,
        ratingVolatility: p1After.volatility,
        gamesPlayed: ladderSets,
        // The cancelled practice set is the only thing that ever touched this
        // track, and it no longer counts.
        practiceRating: GLICKO2_INITIAL_RATING,
        practiceRatingDeviation: GLICKO2_INITIAL_RD,
        practiceRatingVolatility: GLICKO2_INITIAL_VOLATILITY,
        practiceGamesPlayed: 0,
      },
    });
    await tx.user.update({
      where: { id: set.player2Id },
      data: { rating: opponent.rating + opponentShift },
    });

    await tx.ratingHistory.updateMany({
      where: { matchId: NEXT_LADDER_SET, userId: BUTTERKIX },
      data: { ratingBefore: p1Before.rating, ratingAfter: p1After.rating, delta: p1After.rating - p1Before.rating },
    });
    await tx.ratingHistory.updateMany({
      where: { matchId: NEXT_LADDER_SET, userId: set.player2Id },
      data: { ratingBefore: p2Before.rating, ratingAfter: p2After.rating, delta: p2After.rating - p2Before.rating },
    });

    // The cancelled practice set left RatingHistory rows only if it was ever
    // mis-logged to the main track; deleting is a no-op otherwise.
    await tx.ratingHistory.deleteMany({ where: { matchId: CANCELLED_PRACTICE_SET } });
  });

  console.log("\nApplied.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
