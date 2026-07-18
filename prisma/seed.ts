import { prisma } from "../src/lib/db";

const SEED_USERS = [
  { discordId: "seed-001", username: "FoxMain_East", rating: 1820, gamesPlayed: 62 },
  { discordId: "seed-002", username: "PikaChamp", rating: 1705, gamesPlayed: 48 },
  { discordId: "seed-003", username: "GnwGrandpa", rating: 1590, gamesPlayed: 33 },
  { discordId: "seed-004", username: "SheikBae", rating: 1500, gamesPlayed: 12 },
  { discordId: "seed-005", username: "RookieRoy", rating: 1420, gamesPlayed: 7 },
  { discordId: "seed-006", username: "PlacementPuff", rating: 1550, gamesPlayed: 4 },
];

async function main() {
  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { discordId: user.discordId },
      update: user,
      create: user,
    });
  }
  console.log(`Seeded ${SEED_USERS.length} users.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
