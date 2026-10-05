import { prisma } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";
import { generateCoachingInsightText } from "@/lib/coaching-insight";

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

// Deterministic, order-independent summary of the exact numbers that would
// go into an AI-generated insight — compared against User.aiInsightSignature
// to decide whether the cached aiInsightBody is still current (see
// getOrGenerateCoachingInsight). Rows are pre-sorted by toWinRateRows
// (descending total), so the string is already stable run-to-run without
// needing its own sort here.
export function buildAnalyticsSignature(stats: PersonalAnalytics): string {
  const latestRating = stats.ratingTrend.at(-1)?.rating ?? null;
  const rowsPart = (rows: WinRateRow[]) => rows.map((r) => `${r.label}:${r.wins}-${r.losses}`).join(",");
  return [
    `games:${stats.ratingTrend.length}`,
    `rating:${latestRating}`,
    `chars:${rowsPart(stats.characterWinRates)}`,
    `stages:${rowsPart(stats.stageWinRates)}`,
  ].join("|");
}

// Regenerates only when the player's underlying stats have actually changed
// since the last cached insight — viewing /analytics repeatedly between
// matches never re-calls the AI Gateway. Never throws: a generation failure
// (missing key, rate limit, gateway hiccup) just falls back to the last
// cached body, or null if there's never been a successful one — same
// "never load-bearing" philosophy as translateText.
export async function getOrGenerateCoachingInsight(userId: string, stats: PersonalAnalytics): Promise<string | null> {
  const signature = buildAnalyticsSignature(stats);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiInsightBody: true, aiInsightSignature: true },
  });

  if (user?.aiInsightSignature === signature) return user.aiInsightBody;

  try {
    const body = await generateCoachingInsightText(stats);
    await prisma.user.update({
      where: { id: userId },
      data: { aiInsightBody: body, aiInsightSignature: signature, aiInsightGeneratedAt: new Date() },
    });
    return body;
  } catch {
    return user?.aiInsightBody ?? null;
  }
}
