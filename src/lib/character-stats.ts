import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { SMASH_CHARACTERS, echoGroupCanonical, type SmashCharacter } from "@/lib/characters";
import { MatchStatus, UserStatus } from "@/generated/prisma/enums";
import { getActiveSeason } from "@/lib/seasons";
import { DELETED_USERNAME } from "@/lib/account";
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

/** One echo group's usage across the active season. */
export type CharacterUsageStats = {
  /** The group's canonical fighter — echoes fold into their base. */
  character: SmashCharacter;
  /** Ranked players who main or co-main it. */
  players: number;
  /** Of those, the ones who main it. */
  mains: number;
  /** Ranked games played on it this season. */
  games: number;
  /** Percentage, or null below one game. */
  winRate: number | null;
  /** Mean rating of `players`, or null when there are none. */
  avgRating: number | null;
};

/**
 * Per-character usage for the active season, keyed by echo group.
 *
 * Lifted out of the Stats > Characters table component so a single
 * character's page can report the same figures as the table it is linked
 * from — two pages disagreeing about a fighter's win rate is worse than
 * either of them being approximate. Returns language-free numbers; labelling
 * is the caller's business (see echoGroupLabel).
 *
 * Two queries whatever the roster size, so it is cheap enough to call for one
 * character and read a single entry out of.
 */
export async function getCharacterUsageStats(): Promise<Map<SmashCharacter, CharacterUsageStats>> {
  const season = await getActiveSeason();

  // Same inclusion rules as the per-character leaderboard itself
  // (getLeaderboardPlayers): the leaderboard's games floor — the same set
  // count a player needs to move past provisional, so a hidden rating never
  // lands on a public board — plus no banned or Discord-self-deleted
  // accounts. Every figure scopes to this same population, and to the active
  // season, since User.gamesPlayed and rating reset at each rollover.
  const leaderboardWhere: Prisma.UserWhereInput = {
    gamesPlayed: { gte: LEADERBOARD_MIN_GAMES },
    status: { not: UserStatus.BANNED },
    username: { not: DELETED_USERNAME },
  };

  const canonical = (c: string) => echoGroupCanonical(c as SmashCharacter);

  const [leaderboardPlayers, rankedGames] = await Promise.all([
    prisma.user.findMany({
      where: leaderboardWhere,
      select: { id: true, mainCharacter: true, secondaryCharacters: true, rating: true },
    }),
    prisma.matchGame.findMany({
      where: {
        winnerId: { not: null },
        match: { status: MatchStatus.CONFIRMED, seasonId: season?.id ?? null },
      },
      select: {
        actorAId: true,
        actorACharacter: true,
        actorBId: true,
        actorBCharacter: true,
        winnerId: true,
        match: {
          select: { player1Id: true, player2Id: true, player1IsPracticing: true, player2IsPracticing: true },
        },
      },
    }),
  ]);
  const eligibleIds = new Set(leaderboardPlayers.map((u) => u.id));

  const mainsByGroup = new Map<string, number>();
  const playersByGroup = new Map<string, number>();
  const ratingSumByGroup = new Map<string, number>();
  const gamesByGroup = new Map<string, { games: number; wins: number }>();

  for (const u of leaderboardPlayers) {
    const mainGroup = u.mainCharacter ? canonical(u.mainCharacter) : null;
    const secondaryGroups = new Set(u.secondaryCharacters.map(canonical));
    if (mainGroup) secondaryGroups.delete(mainGroup);

    if (mainGroup) {
      mainsByGroup.set(mainGroup, (mainsByGroup.get(mainGroup) ?? 0) + 1);
      playersByGroup.set(mainGroup, (playersByGroup.get(mainGroup) ?? 0) + 1);
      ratingSumByGroup.set(mainGroup, (ratingSumByGroup.get(mainGroup) ?? 0) + u.rating);
    }
    for (const group of secondaryGroups) {
      playersByGroup.set(group, (playersByGroup.get(group) ?? 0) + 1);
      ratingSumByGroup.set(group, (ratingSumByGroup.get(group) ?? 0) + u.rating);
    }
  }

  for (const g of rankedGames) {
    const sides = [
      { actorId: g.actorAId, character: g.actorACharacter },
      { actorId: g.actorBId, character: g.actorBCharacter },
    ];
    for (const { actorId, character } of sides) {
      if (!character || !eligibleIds.has(actorId)) continue;
      // A practicing side's games go to its separate track, so counting them
      // here would mix two rating pools into one win rate.
      const practicing =
        (g.match.player1Id === actorId && g.match.player1IsPracticing) ||
        (g.match.player2Id === actorId && g.match.player2IsPracticing);
      if (practicing) continue;
      const group = canonical(character);
      const entry = gamesByGroup.get(group) ?? { games: 0, wins: 0 };
      entry.games++;
      if (g.winnerId === actorId) entry.wins++;
      gamesByGroup.set(group, entry);
    }
  }

  // One entry per echo group (Peach absorbs Daisy, etc.) rather than one per
  // roster entry — echoes are functionally the same fighter, so splitting
  // their usage across separate entries just undercounts both.
  const out = new Map<SmashCharacter, CharacterUsageStats>();
  for (const c of SMASH_CHARACTERS) {
    if (echoGroupCanonical(c) !== c) continue;
    const games = gamesByGroup.get(c) ?? { games: 0, wins: 0 };
    const players = playersByGroup.get(c) ?? 0;
    out.set(c, {
      character: c,
      players,
      mains: mainsByGroup.get(c) ?? 0,
      games: games.games,
      winRate: games.games > 0 ? Math.round((games.wins / games.games) * 100) : null,
      avgRating: players > 0 ? Math.round((ratingSumByGroup.get(c) ?? 0) / players) : null,
    });
  }
  return out;
}
