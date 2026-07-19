import { prisma } from "@/lib/db";
import { SMASH_CHARACTERS, type SmashCharacter } from "@/lib/characters";

function assertValidCharacter(character: string): asserts character is SmashCharacter {
  if (!(SMASH_CHARACTERS as readonly string[]).includes(character)) {
    throw new Error("Not a recognized character");
  }
}

export async function getCharacterLeaderboard(character: string) {
  assertValidCharacter(character);
  return prisma.user.findMany({
    where: { mainCharacter: character, gamesPlayed: { gte: 10 } },
    orderBy: { rating: "desc" },
    select: { id: true, username: true, rating: true, gamesPlayed: true },
  });
}

// Self-reporting a main character is easy to game (or just go stale), so
// it's set by whoever actually played against you instead — optional, and
// only from a match you were both actually in.
export async function reportOpponentCharacter(
  reporterId: string,
  matchId: string,
  character: string,
) {
  assertValidCharacter(character);

  const match = await prisma.ratingMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Match not found");
  if (match.player1Id !== reporterId && match.player2Id !== reporterId) {
    throw new Error("Not a participant in this match");
  }

  const opponentId = match.player1Id === reporterId ? match.player2Id : match.player1Id;
  await prisma.user.update({ where: { id: opponentId }, data: { mainCharacter: character } });
}
