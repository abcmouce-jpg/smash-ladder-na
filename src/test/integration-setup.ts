import { beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";

// Children before parents — explicit rather than relying on cascade
// settings, so this stays correct even if a model's onDelete behavior
// changes later.
beforeEach(async () => {
  await prisma.ratingHistory.deleteMany();
  await prisma.matchGame.deleteMany();
  await prisma.matchComment.deleteMany();
  await prisma.conductReport.deleteMany();
  await prisma.ratingMatch.deleteMany();
  await prisma.ratingLobbyEntry.deleteMany();
  await prisma.seasonStanding.deleteMany();
  await prisma.season.deleteMany();
  await prisma.tournamentEntry.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.freeBattlePost.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
