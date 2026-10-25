// How many people actually press the match-flow shortcut buttons?
//
// Most of them leave almost no trace, which is itself the finding:
//
//   Rematch ("Run it back" after a set) - clean: the next match is created
//     with pairingMethod REMATCH, so both the count and who did it survive.
//     The REQUEST side is lossy by design (player{1,2}RematchRequestedAt is
//     cleared when that player leaves the match), so asked-but-declined is a
//     floor, not a count.
//
//   Stage proposal ("PS2?") - proposedStage/proposedById are cleared the
//     moment the proposal resolves (see acceptGameStageProposal), so nothing
//     records that it happened. It is reconstructed here from the only
//     side-effect it leaves: a stage decided before the strikes were spent.
//     On game 1 that is unambiguous - the stage can otherwise only be set
//     after all 3 strikes - but a proposal accepted AFTER striking finishes
//     looks exactly like a normal pick, so game 1 is a floor too. Games 2+
//     are not reported: the ban-phase timeout and the stalled-character
//     replay both set finalStage early as well, so the same test there would
//     count AFK opponents as button presses.
//
//   Run it back (stage) / Same bans / Undo strike - not reported: each one
//     produces a state a normal sequence of clicks could also produce. There
//     is no honest number for these without a counter in the schema.
//
//   Quick messages - the four chat buttons write an ordinary MatchComment, so
//     this matches on the exact default strings. A floor again: someone can
//     type "ggs!" by hand, and a player who customised their four is counted
//     only if their text still matches a default.
//
//   npx tsx scripts/feature-usage.ts
import { prisma } from "../src/lib/db";
import { getActiveSeason } from "../src/lib/seasons";
import { DEFAULT_QUICK_MESSAGES } from "../src/lib/quick-messages";
import { GAME_ONE_STAGES } from "../src/lib/stages";

function pct(part: number, whole: number) {
  return whole === 0 ? "n/a" : `${((100 * part) / whole).toFixed(1)}%`;
}

async function main() {
  const season = await getActiveSeason();
  const seasonStart = season?.startsAt ?? new Date(0);

  const [matches] = await prisma.$queryRawUnsafe<
    { total: number; rematch: number; auto: number; manual: number; season_rematch: number }[]
  >(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE "pairingMethod" = 'REMATCH')::int AS rematch,
            COUNT(*) FILTER (WHERE "pairingMethod" = 'AUTO')::int AS auto,
            COUNT(*) FILTER (WHERE "pairingMethod" = 'MANUAL')::int AS manual,
            COUNT(*) FILTER (WHERE "pairingMethod" = 'REMATCH' AND "createdAt" >= $1)::int AS season_rematch
       FROM "RatingMatch"`,
    seasonStart,
  );

  const [rematchUsers] = await prisma.$queryRawUnsafe<{ players: number; pairs: number; max_chain: number }[]>(
    `WITH r AS (SELECT "player1Id", "player2Id" FROM "RatingMatch" WHERE "pairingMethod" = 'REMATCH'),
          sides AS (SELECT "player1Id" AS uid FROM r UNION ALL SELECT "player2Id" FROM r)
     SELECT (SELECT COUNT(DISTINCT uid)::int FROM sides) AS players,
            (SELECT COUNT(*)::int FROM (SELECT DISTINCT LEAST("player1Id","player2Id"), GREATEST("player1Id","player2Id") FROM r) p) AS pairs,
            (SELECT MAX(c)::int FROM (SELECT COUNT(*) AS c FROM r GROUP BY LEAST("player1Id","player2Id"), GREATEST("player1Id","player2Id")) q) AS max_chain`,
  );

  // Floor: the stamp is wiped when that player leaves the match.
  const [asked] = await prisma.$queryRawUnsafe<{ matches: number; players: number }[]>(
    `WITH a AS (
       SELECT "player1Id" AS uid, id FROM "RatingMatch" WHERE "player1RematchRequestedAt" IS NOT NULL
       UNION ALL
       SELECT "player2Id" AS uid, id FROM "RatingMatch" WHERE "player2RematchRequestedAt" IS NOT NULL
     )
     SELECT COUNT(DISTINCT id)::int AS matches, COUNT(DISTINCT uid)::int AS players FROM a`,
  );

  const [proposal] = await prisma.$queryRawUnsafe<
    { games: number; game_ones: number; matches: number; players: number; stages: string }[]
  >(
    `WITH shortcut AS (
       SELECT g.id, g."matchId", g."finalStage"
         FROM "MatchGame" g
        WHERE g."gameNumber" = 1
          AND g."finalStage" IS NOT NULL
          AND COALESCE(array_length(g."struckStages", 1), 0) < g."actorAStrikes" + g."actorBStrikes"
     ),
     sides AS (
       SELECT m."player1Id" AS uid FROM shortcut s JOIN "RatingMatch" m ON m.id = s."matchId"
       UNION ALL
       SELECT m."player2Id" FROM shortcut s JOIN "RatingMatch" m ON m.id = s."matchId"
     )
     SELECT (SELECT COUNT(*)::int FROM shortcut) AS games,
            (SELECT COUNT(*)::int FROM "MatchGame" WHERE "gameNumber" = 1 AND "finalStage" IS NOT NULL) AS game_ones,
            (SELECT COUNT(DISTINCT "matchId")::int FROM shortcut) AS matches,
            (SELECT COUNT(DISTINCT uid)::int FROM sides) AS players,
            (SELECT string_agg(x.stage || ' ' || x.n, ', ' ORDER BY x.n DESC)
               FROM (SELECT "finalStage" AS stage, COUNT(*)::int AS n FROM shortcut GROUP BY "finalStage") x) AS stages`,
  );

  const [quick] = await prisma.$queryRawUnsafe<
    { comments: number; total: number; authors: number; commenters: number; customised: number }[]
  >(
    `SELECT (SELECT COUNT(*)::int FROM "MatchComment" WHERE body = ANY($1)) AS comments,
            (SELECT COUNT(*)::int FROM "MatchComment") AS total,
            (SELECT COUNT(DISTINCT "authorId")::int FROM "MatchComment" WHERE body = ANY($1)) AS authors,
            (SELECT COUNT(DISTINCT "authorId")::int FROM "MatchComment") AS commenters,
            (SELECT COUNT(*)::int FROM "User" WHERE array_length("quickMessages", 1) > 0) AS customised`,
    DEFAULT_QUICK_MESSAGES,
  );

  console.log(`season: ${season?.name ?? "(none)"}   matches all time: ${matches.total}\n`);

  console.log("Rematch button (exact — the match it creates is tagged REMATCH)");
  console.log(`  matches created by it : ${matches.rematch}  (${pct(matches.rematch, matches.total)} of all matches)`);
  console.log(`  this season           : ${matches.season_rematch}`);
  console.log(`  distinct players      : ${rematchUsers.players}`);
  console.log(
    `  distinct pairs        : ${rematchUsers.pairs}   longest chain between one pair: ${rematchUsers.max_chain}`,
  );
  console.log(`  pairing mix           : AUTO ${matches.auto}, MANUAL ${matches.manual}, REMATCH ${matches.rematch}`);
  console.log(`  asked (floor, stamp is cleared on leave): ${asked.matches} matches, ${asked.players} players\n`);

  console.log('Stage proposal button ("PS2?") — reconstructed, game 1 only, floor');
  console.log(`  game 1s decided before striking finished : ${proposal.games}`);
  console.log(
    `  share of all decided game 1s             : ${pct(proposal.games, proposal.game_ones)}  (of ${proposal.game_ones})`,
  );
  console.log(`  distinct matches                         : ${proposal.matches}`);
  console.log(
    `  players in those matches                 : ${proposal.players}  (one of each pair proposed, so the real user count is between ${proposal.matches ? 1 : 0} and this)`,
  );
  console.log(`  stages agreed on                         : ${proposal.stages ?? "-"}`);
  console.log(`  (game 1 pool: ${GAME_ONE_STAGES.join(", ")})\n`);

  console.log("Quick message buttons (floor — matches the default four exactly)");
  console.log(
    `  comments matching a default : ${quick.comments}  (${pct(quick.comments, quick.total)} of ${quick.total} chat messages)`,
  );
  console.log(
    `  players who sent one        : ${quick.authors}  (of ${quick.commenters} who ever sent any chat message)`,
  );
  console.log(`  players who customised them : ${quick.customised}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
