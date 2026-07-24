import { prisma } from "../src/lib/db";
import {
  ConfirmationMethod,
  MatchStatus,
  PairingMethod,
  TournamentStatus,
} from "../src/generated/prisma/enums";

const SEED_USERS = [
  { discordId: "seed-001", username: "FoxMain_East", rating: 1820, gamesPlayed: 62, mainCharacter: "Fox" },
  { discordId: "seed-002", username: "PikaChamp", rating: 1705, gamesPlayed: 48, mainCharacter: "Pikachu" },
  { discordId: "seed-003", username: "GnwGrandpa", rating: 1590, gamesPlayed: 33, mainCharacter: "Mr. Game & Watch" },
  { discordId: "seed-004", username: "SheikBae", rating: 1500, gamesPlayed: 12, mainCharacter: "Sheik" },
  { discordId: "seed-005", username: "RookieRoy", rating: 1420, gamesPlayed: 7, mainCharacter: "Roy" },
  { discordId: "seed-006", username: "PlacementPuff", rating: 1550, gamesPlayed: 4, mainCharacter: "Jigglypuff" },
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
