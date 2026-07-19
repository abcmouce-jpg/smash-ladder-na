import { prisma } from "@/lib/db";
import { SMASH_CHARACTERS, type SmashCharacter } from "@/lib/characters";

function assertValidCharacter(character: string): asserts character is SmashCharacter {
  if (!(SMASH_CHARACTERS as readonly string[]).includes(character)) {
    throw new Error("Not a recognized character");
  }
}

export async function setMainCharacter(userId: string, character: string | null) {
  if (character !== null) assertValidCharacter(character);
  await prisma.user.update({ where: { id: userId }, data: { mainCharacter: character } });
}

export async function getCharacterLeaderboard(character: string) {
  assertValidCharacter(character);
  return prisma.user.findMany({
    where: { mainCharacter: character, gamesPlayed: { gte: 10 } },
    orderBy: { rating: "desc" },
    select: { id: true, username: true, rating: true, gamesPlayed: true },
  });
}

export async function castCharacterVote(userId: string, character: string) {
  assertValidCharacter(character);
  await prisma.characterVote.upsert({
    where: { userId },
    update: { character },
    create: { userId, character },
  });
}

export async function getCharacterVoteResults() {
  const votes = await prisma.characterVote.groupBy({
    by: ["character"],
    _count: { character: true },
    orderBy: { _count: { character: "desc" } },
  });
  const total = votes.reduce((sum, v) => sum + v._count.character, 0);
  return votes.map((v) => ({
    character: v.character,
    votes: v._count.character,
    share: total === 0 ? 0 : v._count.character / total,
  }));
}

export async function getMyCharacterVote(userId: string) {
  const vote = await prisma.characterVote.findUnique({ where: { userId } });
  return vote?.character ?? null;
}
