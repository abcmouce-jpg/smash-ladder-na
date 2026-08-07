import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { SMASH_CHARACTERS, type SmashCharacter } from "@/lib/characters";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { getCharacterUsage } from "@/lib/players";

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

// Caps how many secondaries recomputeCharacterUsage below will derive from
// real play — a handful is enough without the profile turning into "plays
// everyone."
const MAX_SECONDARY_CHARACTERS = 5;

// A character only counts as an auto-derived secondary once it's a real
// fraction of this player's actual games — otherwise a couple of
// off-character picks (well under a third of their sets) would earn a
// permanent spot on that character's leaderboard entry, which reads as
// "this person mains/co-mains it" to anyone filtering by character. Matches
// the icon-display floor in character-usage-display.ts.
const SECONDARY_CHARACTER_MIN_USAGE_PERCENT = 30;

// Keeps mainCharacter/secondaryCharacters in sync with what a player
// actually plays, derived fresh from real game data every time — replaced
// the old peer-report mechanism (an opponent manually reporting your
// character after a match), which kept freezing on whichever character got
// reported first. Called for both players every time a match confirms —
// see applyEloAndConfirm.
export async function recomputeCharacterUsage(userId: string, tx: Prisma.TransactionClient) {
  const usage = await getCharacterUsage(userId, tx);
  const mainCharacter = usage[0]?.character ?? null;
  const secondaryCharacters = usage
    .slice(1)
    .filter((u) => u.usagePercent >= SECONDARY_CHARACTER_MIN_USAGE_PERCENT)
    .slice(0, MAX_SECONDARY_CHARACTERS)
    .map((u) => u.character);

  await tx.user.update({
    where: { id: userId },
    data: { mainCharacter, secondaryCharacters },
  });
}
