import { prisma } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";

export interface RatingTrendPoint {
  date: Date;
  rating: number;
}

export interface WinRateRow {
  label: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
}

function toWinRateRows(record: Map<string, { wins: number; losses: number }>): WinRateRow[] {
  return [...record.entries()]
    .map(([label, { wins, losses }]) => ({ label, wins, losses, total: wins + losses, winRate: wins / (wins + losses) }))
    .sort((a, b) => b.total - a.total);
}

// Gold-exclusive personal analytics (see /analytics) — rating history over
// time, plus a win-rate breakdown by the character this player used and by
// the stage each game was decided on. Practice games are excluded (they're
// a separate rating track that never touches real standing), matching how
// career/season stats elsewhere only count the non-practice side of a
// match.
export async function getPersonalAnalytics(userId: string) {
  const [ratingHistory, games] = await Promise.all([
    prisma.ratingHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, ratingAfter: true },
    }),
    prisma.matchGame.findMany({
      where: {
        winnerId: { not: null },
        OR: [{ actorAId: userId }, { actorBId: userId }],
        match: { status: MatchStatus.CONFIRMED },
      },
      select: {
        actorAId: true,
        actorACharacter: true,
        actorBId: true,
        actorBCharacter: true,
        finalStage: true,
        winnerId: true,
        match: { select: { player1Id: true, player1IsPracticing: true, player2IsPracticing: true } },
      },
    }),
  ]);

  const characterRecord = new Map<string, { wins: number; losses: number }>();
  const stageRecord = new Map<string, { wins: number; losses: number }>();

  for (const game of games) {
    const wasPracticing =
      game.match.player1Id === userId ? game.match.player1IsPracticing : game.match.player2IsPracticing;
    if (wasPracticing) continue;

    const isActorA = game.actorAId === userId;
    const character = isActorA ? game.actorACharacter : game.actorBCharacter;
    const won = game.winnerId === userId;

    if (character) {
      const rec = characterRecord.get(character) ?? { wins: 0, losses: 0 };
      if (won) rec.wins++;
      else rec.losses++;
      characterRecord.set(character, rec);
    }
    if (game.finalStage) {
      const rec = stageRecord.get(game.finalStage) ?? { wins: 0, losses: 0 };
      if (won) rec.wins++;
      else rec.losses++;
      stageRecord.set(game.finalStage, rec);
    }
  }

  const ratingTrend: RatingTrendPoint[] = ratingHistory.map((r) => ({ date: r.createdAt, rating: r.ratingAfter }));

  return {
    ratingTrend,
    characterWinRates: toWinRateRows(characterRecord),
    stageWinRates: toWinRateRows(stageRecord),
  };
}

export type PersonalAnalytics = Awaited<ReturnType<typeof getPersonalAnalytics>>;
