import { prisma } from "@/lib/db";

let counter = 0;

export async function createTestUser(overrides: Partial<Parameters<typeof prisma.user.create>[0]["data"]> = {}) {
  counter++;
  return prisma.user.create({
    data: {
      discordId: `test-discord-${counter}`,
      username: `TestUser${counter}`,
      rating: 1500,
      gamesPlayed: 0,
      region: "USA East",
      maxMatchDistanceKm: 5000,
      ...overrides,
    },
  });
}
