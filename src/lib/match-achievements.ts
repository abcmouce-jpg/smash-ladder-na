import { prisma } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";
import { COUNTERPICK_STAGES } from "@/lib/stages";
import { dayKeyInTimeZone } from "@/lib/timezone";
import type { Achievement } from "@/lib/rank-tier";

export type AchievementGame = {
  actorAId: string;
  actorACharacter: string | null;
  actorBId: string;
  actorBCharacter: string | null;
  winnerId: string | null;
  finalStage: string | null;
};

export type AchievementMatch = {
  opponentId: string;
  won: boolean;
  confirmedAt: Date;
  games: AchievementGame[];
};

function myCharacter(g: AchievementGame, userId: string): string | null {
  return g.actorAId === userId ? g.actorACharacter : g.actorBId === userId ? g.actorBCharacter : null;
}

function opponentCharacter(g: AchievementGame, userId: string): string | null {
  return g.actorAId === userId ? g.actorBCharacter : g.actorBId === userId ? g.actorACharacter : null;
}

// Every game in a won set used a different character — vacuously excludes
// any set with a game missing a character (e.g. one a mod force-decided via
// adminSetGameWinner without either side ever picking).
export function hasJackOfTrades(matches: AchievementMatch[], userId: string): boolean {
  return matches.some((m) => {
    if (!m.won || m.games.length === 0) return false;
    const chars = m.games.map((g) => myCharacter(g, userId));
    if (chars.some((c) => !c)) return false;
    return new Set(chars).size === chars.length;
  });
}

// Both sides stuck to one character apiece for the whole set, and it was
// the same character — not just "matched in some game", the whole set.
export function hasMirrorMatch(matches: AchievementMatch[], userId: string): boolean {
  return matches.some((m) => {
    if (!m.won || m.games.length === 0) return false;
    const mine = new Set(m.games.map((g) => myCharacter(g, userId)));
    const theirs = new Set(m.games.map((g) => opponentCharacter(g, userId)));
    if (mine.size !== 1 || theirs.size !== 1) return false;
    const [mineOnly] = mine;
    const [theirsOnly] = theirs;
    return mineOnly !== null && mineOnly === theirsOnly;
  });
}

// Same character for games 1-4, a swap for game 5, and the set went the
// full 5 games and was won (winning game 5 is the only way a 5-game set
// decides, so "won" here always means winning that last, swapped-character
// game).
export function hasRiskyBusiness(matches: AchievementMatch[], userId: string): boolean {
  return matches.some((m) => {
    if (!m.won || m.games.length !== 5) return false;
    const chars = m.games.map((g) => myCharacter(g, userId));
    if (chars.some((c) => !c)) return false;
    const [g1, g2, g3, g4, g5] = chars;
    return g1 === g2 && g2 === g3 && g3 === g4 && g5 !== g4;
  });
}

// Cumulative across every game ever played, not scoped to one set — has
// this player won at least one game on every stage in the current pool?
export function hasGlobetrotter(matches: AchievementMatch[], userId: string): boolean {
  const wonStages = new Set<string>();
  for (const m of matches) {
    for (const g of m.games) {
      if (g.winnerId === userId && g.finalStage) wonStages.add(g.finalStage);
    }
  }
  return COUNTERPICK_STAGES.every((stage) => wonStages.has(stage));
}

// This opponent's previous meeting (regardless of how long ago, or how many
// other opponents were played in between) was a loss, and this one's a win.
export function hasGrudgeMatch(matches: AchievementMatch[]): boolean {
  const byOpponent = new Map<string, AchievementMatch[]>();
  for (const m of matches) {
    const list = byOpponent.get(m.opponentId);
    if (list) list.push(m);
    else byOpponent.set(m.opponentId, [m]);
  }
  for (const list of byOpponent.values()) {
    for (let i = 1; i < list.length; i++) {
      if (!list[i - 1].won && list[i].won) return true;
    }
  }
  return false;
}

const dayKey = dayKeyInTimeZone;

// The first set played on any day (ever) was a win.
export function hasBeginnersLuck(matches: AchievementMatch[]): boolean {
  const seenDays = new Set<string>();
  for (const m of matches) {
    const key = dayKey(m.confirmedAt);
    if (seenDays.has(key)) continue;
    seenDays.add(key);
    if (m.won) return true;
  }
  return false;
}

// The first set played on some day was a loss, and the very next set played
// overall (not necessarily the same day) was a win.
export function hasBounceBack(matches: AchievementMatch[]): boolean {
  const seenDays = new Set<string>();
  for (let i = 0; i < matches.length; i++) {
    const key = dayKey(matches[i].confirmedAt);
    if (seenDays.has(key)) continue;
    seenDays.add(key);
    if (!matches[i].won && matches[i + 1]?.won) return true;
  }
  return false;
}

// Derived from full match/game history rather than a stored table, same
// approach as computeAchievements in rank-tier.ts — these just need a
// heavier query (every confirmed set and its games) instead of a handful of
// pre-aggregated counters.
export async function getMatchHistoryAchievements(userId: string): Promise<Achievement[]> {
  const rawMatches = await prisma.ratingMatch.findMany({
    where: {
      status: MatchStatus.CONFIRMED,
      confirmedAt: { not: null },
      OR: [
        { player1Id: userId, player1IsPracticing: false },
        { player2Id: userId, player2IsPracticing: false },
      ],
    },
    orderBy: { confirmedAt: "asc" },
    select: { id: true, player1Id: true, player2Id: true, reportedWinnerId: true, confirmedAt: true },
  });

  const matches: AchievementMatch[] = [];
  if (rawMatches.length > 0) {
    const games = await prisma.matchGame.findMany({
      where: { matchId: { in: rawMatches.map((m) => m.id) }, winnerId: { not: null } },
      orderBy: [{ matchId: "asc" }, { gameNumber: "asc" }],
      select: {
        matchId: true,
        actorAId: true,
        actorACharacter: true,
        actorBId: true,
        actorBCharacter: true,
        winnerId: true,
        finalStage: true,
      },
    });
    const gamesByMatch = new Map<string, AchievementGame[]>();
    for (const g of games) {
      const list = gamesByMatch.get(g.matchId);
      if (list) list.push(g);
      else gamesByMatch.set(g.matchId, [g]);
    }

    for (const m of rawMatches) {
      matches.push({
        opponentId: m.player1Id === userId ? m.player2Id : m.player1Id,
        won: m.reportedWinnerId === userId,
        confirmedAt: m.confirmedAt!,
        games: gamesByMatch.get(m.id) ?? [],
      });
    }
  }

  return [
    {
      id: "jack-of-trades",
      label: "Jack of Trades",
      description: "Win a set using a different character every game.",
      achieved: hasJackOfTrades(matches, userId),
    },
    {
      id: "mirror-match",
      label: "Mirror Match",
      description: "Win a set where you and your opponent played the exact same character the whole way.",
      achieved: hasMirrorMatch(matches, userId),
    },
    {
      id: "risky-business",
      label: "Risky Business",
      description:
        "Play the same character for games 1-4 of a set, then swap to a different character for game 5 and win it.",
      achieved: hasRiskyBusiness(matches, userId),
    },
    {
      id: "globetrotter",
      label: "Globetrotter",
      description: "Win at least one game on every legal stage.",
      achieved: hasGlobetrotter(matches, userId),
    },
    {
      id: "grudge-match",
      label: "Grudge Match",
      description: "Beat an opponent who beat you the last time you played them.",
      achieved: hasGrudgeMatch(matches),
    },
    {
      id: "beginners-luck",
      label: "Beginner's Luck",
      description: "Win the first set you play on some day.",
      achieved: hasBeginnersLuck(matches),
    },
    {
      id: "bounce-back",
      label: "Bounce Back",
      description: "Lose the first set you play on some day, then win the very next set you play.",
      achieved: hasBounceBack(matches),
    },
  ];
}
