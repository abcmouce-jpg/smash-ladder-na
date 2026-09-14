import { prisma } from "../src/lib/db";
import {
  ConfirmationMethod,
  MatchStatus,
  PairingMethod,
  PostStatus,
  TournamentStatus,
} from "../src/generated/prisma/enums";

const SEED_USERS = [
  {
    discordId: "seed-001",
    username: "FoxMain_East",
    rating: 1820,
    gamesPlayed: 62,
    mainCharacter: "Fox",
    region: "New York",
    twitchUsername: "foxmain_east",
    twitchDisplayName: "FoxMainEast",
  },
  {
    discordId: "seed-002",
    username: "PikaChamp",
    rating: 1705,
    gamesPlayed: 48,
    mainCharacter: "Pikachu",
    region: "California",
    twitchUsername: "pikachamp_tv",
    twitchDisplayName: "PikaChamp",
  },
  {
    discordId: "seed-003",
    username: "GnwGrandpa",
    rating: 1590,
    gamesPlayed: 33,
    mainCharacter: "Mr. Game & Watch",
    region: "Texas",
  },
  {
    discordId: "seed-004",
    username: "SheikBae",
    rating: 1500,
    gamesPlayed: 12,
    mainCharacter: "Sheik",
    region: "Florida",
  },
  {
    discordId: "seed-005",
    username: "RookieRoy",
    rating: 1420,
    gamesPlayed: 7,
    mainCharacter: "Roy",
    region: "Washington",
  },
  {
    discordId: "seed-006",
    username: "PlacementPuff",
    rating: 1550,
    gamesPlayed: 4,
    mainCharacter: "Jigglypuff",
    region: "Ohio",
  },
] as const;

// (winnerIndex, loserIndex, daysAgo) into SEED_USERS — a small, hand-picked
// schedule rather than a full replay of everyone's real gamesPlayed count.
// Illustrative only: enough recent history for the profile match list and
// rating chart to have something to show, not a reconciled ledger back to
// each user's final `rating` above.
const SEED_MATCHES = [
  [0, 1, 9],
  [0, 2, 8],
  [1, 3, 7],
  [2, 3, 6],
  [1, 4, 5],
  [0, 5, 4],
  [2, 5, 3],
  [3, 4, 2],
  [1, 2, 1],
] as const;

async function main() {
  const users = [];
  for (const user of SEED_USERS) {
    users.push(
      await prisma.user.upsert({
        where: { discordId: user.discordId },
        update: user,
        create: user,
      }),
    );
  }
  console.log(`Seeded ${users.length} users.`);

  const season = await prisma.season.upsert({
    where: { id: "seed-season-1" },
    update: {},
    create: { id: "seed-season-1", name: "Season 1" },
  });
  console.log(`Seeded season: ${season.name}`);

  let matchesSeeded = 0;
  for (const [winnerIdx, loserIdx, daysAgo] of SEED_MATCHES) {
    const winner = users[winnerIdx];
    const loser = users[loserIdx];
    const [player1, player2] = winner.id < loser.id ? [winner, loser] : [loser, winner];
    const confirmedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    const existing = await prisma.ratingMatch.findFirst({
      where: { player1Id: player1.id, player2Id: player2.id, confirmedAt },
    });
    if (existing) continue;

    // Deltas are illustrative (fixed +/-20), not a real Elo replay.
    const player1Won = player1.id === winner.id;
    const player1RatingBefore = player1.rating - (player1Won ? 20 : -20);
    const player2RatingBefore = player2.rating - (player1Won ? -20 : 20);

    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: player1.id,
        player2Id: player2.id,
        pairingMethod: PairingMethod.AUTO,
        status: MatchStatus.CONFIRMED,
        reportedWinnerId: winner.id,
        reportedById: winner.id,
        reportedAt: confirmedAt,
        confirmedAt,
        confirmationMethod: ConfirmationMethod.SELF_CONFIRMED,
        player1RatingBefore,
        player1RatingAfter: player1Won ? player1RatingBefore + 20 : player1RatingBefore - 20,
        player2RatingBefore,
        player2RatingAfter: player1Won ? player2RatingBefore - 20 : player2RatingBefore + 20,
        expiresAt: confirmedAt,
        seasonId: season.id,
      },
    });

    await prisma.ratingHistory.createMany({
      data: [
        {
          userId: player1.id,
          matchId: match.id,
          ratingBefore: match.player1RatingBefore!,
          ratingAfter: match.player1RatingAfter!,
          delta: match.player1RatingAfter! - match.player1RatingBefore!,
          createdAt: confirmedAt,
        },
        {
          userId: player2.id,
          matchId: match.id,
          ratingBefore: match.player2RatingBefore!,
          ratingAfter: match.player2RatingAfter!,
          delta: match.player2RatingAfter! - match.player2RatingBefore!,
          createdAt: confirmedAt,
        },
      ],
    });
    matchesSeeded++;
  }
  console.log(`Seeded ${matchesSeeded} confirmed matches.`);

  // ---- Dev-showcase data (idempotent, safe to re-run) ---------------------

  // An ended season + final standings so Stats > Seasons (and the profile
  // Seasons tab) have history to show before a real season closes out.
  const preseason = await prisma.season.upsert({
    where: { id: "seed-season-0" },
    update: {},
    create: {
      id: "seed-season-0",
      name: "Preseason",
      startsAt: new Date("2026-07-25T18:00:00-04:00"),
      endsAt: new Date("2026-08-31T23:59:59-04:00"),
    },
  });
  const ranked = [...users].sort((a, b) => b.rating - a.rating);
  for (const [i, user] of ranked.entries()) {
    const rank = i + 1;
    await prisma.seasonStanding.upsert({
      where: { seasonId_userId: { seasonId: preseason.id, userId: user.id } },
      update: {},
      create: {
        seasonId: preseason.id,
        userId: user.id,
        rank,
        finalRating: user.rating,
        gamesPlayed: user.gamesPlayed,
      },
    });
  }
  console.log(`Seeded Preseason standings for ${ranked.length} players.`);

  // Open Board posts for the landing page's Board section.
  const boardPosts = [
    {
      id: "seed-post-1",
      authorId: users[3].id,
      comment: "Looking for friendlies — Sheik vs Fox/Marth, EST evenings.",
      region: "Florida",
    },
    {
      id: "seed-post-2",
      authorId: users[2].id,
      comment: "Anyone around for a late-night set? G&W main, wired.",
      region: "Texas",
    },
    {
      id: "seed-post-3",
      authorId: users[1].id,
      comment: "Pika ditto practice before the weekly — hit me up!",
      region: "California",
    },
  ] as const;
  for (const post of boardPosts) {
    await prisma.freeBattlePost.upsert({
      where: { id: post.id },
      update: {},
      create: {
        id: post.id,
        authorId: post.authorId,
        comment: post.comment,
        region: post.region,
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
    });
  }
  console.log(`Seeded ${boardPosts.length} open Board posts.`);

  // Two in-progress, streamed sets (users with twitchUsername set become
  // "live" when MOCK_LIVE_TWITCH=1 in .env.development — see twitch-helix.ts)
  // so the Sets page has multiple live entries to drive the stream carousel,
  // plus one 0-0 set that hasn't started for the empty-progress state.
  const liveSets = [
    {
      id: "seed-live-1",
      player1: users[0],
      player2: users[3],
      winner: users[0],
      winnerCharacter: "Fox",
      loserCharacter: "Sheik",
      stage: "Battlefield",
    },
    {
      id: "seed-live-2",
      player1: users[1],
      player2: users[2],
      winner: users[2],
      winnerCharacter: "Mr. Game & Watch",
      loserCharacter: "Pikachu",
      stage: "Smashville",
    },
  ] as const;
  for (const set of liveSets) {
    const created = await prisma.ratingMatch.upsert({
      where: { id: set.id },
      update: {},
      create: {
        id: set.id,
        player1Id: set.player1.id,
        player2Id: set.player2.id,
        pairingMethod: PairingMethod.AUTO,
        status: MatchStatus.PENDING_REPORT,
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });
    // Game 1 decided; game 2 is the current, still-unfinished game.
    const p1WonGame1 = set.winner.id === set.player1.id;
    await prisma.matchGame.upsert({
      where: { id: `${set.id}-g1` },
      update: {},
      create: {
        id: `${set.id}-g1`,
        matchId: created.id,
        gameNumber: 1,
        actorAId: set.player1.id,
        actorAStrikes: 1,
        actorACharacter: p1WonGame1 ? set.winnerCharacter : set.loserCharacter,
        actorBId: set.player2.id,
        actorBStrikes: 2,
        actorBCharacter: p1WonGame1 ? set.loserCharacter : set.winnerCharacter,
        finalStage: set.stage,
        winnerId: set.winner.id,
        reportedWinnerId: set.winner.id,
      },
    });
    await prisma.matchGame.upsert({
      where: { id: `${set.id}-g2` },
      update: {},
      create: {
        id: `${set.id}-g2`,
        matchId: created.id,
        gameNumber: 2,
        actorAId: set.winner.id,
        actorAStrikes: 2,
        actorACharacter: set.winnerCharacter,
        actorBId: set.winner.id === set.player1.id ? set.player2.id : set.player1.id,
        actorBStrikes: 0,
        actorBCharacter: set.loserCharacter,
      },
    });
  }

  const idleMatch = await prisma.ratingMatch.upsert({
    where: { id: "seed-idle-1" },
    update: {},
    create: {
      id: "seed-idle-1",
      player1Id: users[4].id,
      player2Id: users[5].id,
      pairingMethod: PairingMethod.AUTO,
      status: MatchStatus.PENDING_REPORT,
      createdAt: new Date(Date.now() - 4 * 60 * 1000),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  });
  console.log(`Seeded ${liveSets.length} in-progress streamed sets + idle 0-0 match (${idleMatch.id}).`);

  const tournament = await prisma.tournament.upsert({
    where: { id: "seed-tournament-1" },
    update: {},
    create: {
      id: "seed-tournament-1",
      name: "NA Weekly #1",
      description: "A casual weekly local, bracket on start.gg.",
      hostId: users[0].id,
      status: TournamentStatus.SIGNUPS,
    },
  });
  for (const user of users.slice(0, 4)) {
    await prisma.tournamentEntry.upsert({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
      update: {},
      create: { tournamentId: tournament.id, userId: user.id },
    });
  }
  console.log(`Seeded tournament: ${tournament.name} (4 entrants)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
