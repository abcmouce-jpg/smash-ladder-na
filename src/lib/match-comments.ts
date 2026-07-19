import { prisma } from "@/lib/db";

export async function listMatchComments(userId: string, matchId: string) {
  const match = await prisma.ratingMatch.findUnique({
    where: { id: matchId },
    select: { player1Id: true, player2Id: true },
  });
  if (!match) throw new Error("Match not found");
  if (match.player1Id !== userId && match.player2Id !== userId) {
    throw new Error("Not a participant in this match");
  }

  return prisma.matchComment.findMany({
    where: { matchId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, username: true, avatarUrl: true } } },
  });
}

export async function postMatchComment(userId: string, matchId: string, body: string) {
  const trimmed = body.trim().slice(0, 500);
  if (!trimmed) throw new Error("Comment can't be empty");

  const match = await prisma.ratingMatch.findUnique({
    where: { id: matchId },
    select: { player1Id: true, player2Id: true },
  });
  if (!match) throw new Error("Match not found");
  if (match.player1Id !== userId && match.player2Id !== userId) {
    throw new Error("Not a participant in this match");
  }

  await prisma.matchComment.create({ data: { matchId, authorId: userId, body: trimmed } });
}
