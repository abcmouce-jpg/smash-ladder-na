import { prisma } from "@/lib/db";
import { SMASH_CHARACTERS, type SmashCharacter } from "@/lib/characters";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";

function assertValidCharacter(character: string): asserts character is SmashCharacter {
  if (!(SMASH_CHARACTERS as readonly string[]).includes(character)) {
    throw new Error("Not a recognized character");
  }
}

export async function getCharacterLeaderboard(character: string) {
  assertValidCharacter(character);
  return prisma.user.findMany({
    where: {
      gamesPlayed: { gte: LEADERBOARD_MIN_GAMES },
      OR: [{ mainCharacter: character }, { secondaryCharacters: { has: character } }],
    },
    orderBy: { rating: "desc" },
    select: { id: true, username: true, rating: true, gamesPlayed: true },
  });
}

// Caps how many secondaries accumulate from peer reports — a handful is
// enough to stop opponents banning around a single reported character (the
// original problem) without the profile turning into "plays everyone."
const MAX_SECONDARY_CHARACTERS = 5;

// Self-reporting a main character is easy to game (or just go stale), so
// it's set by whoever actually played against you instead — optional, and
// only from a match you were both actually in. The first character anyone
// ever reports becomes mainCharacter; anything different reported later
// accumulates into secondaryCharacters instead of overwriting it, so a
// player who plays multiple characters doesn't get reduced to whichever one
// an opponent happened to report most recently.
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
  const opponent = await prisma.user.findUniqueOrThrow({
    where: { id: opponentId },
    select: { mainCharacter: true, secondaryCharacters: true },
  });

  if (opponent.mainCharacter === null) {
    await prisma.user.update({ where: { id: opponentId }, data: { mainCharacter: character } });
    return;
  }
  if (
    character === opponent.mainCharacter ||
    opponent.secondaryCharacters.includes(character) ||
    opponent.secondaryCharacters.length >= MAX_SECONDARY_CHARACTERS
  ) {
    return;
  }
  await prisma.user.update({
    where: { id: opponentId },
    data: { secondaryCharacters: { push: character } },
  });
}
