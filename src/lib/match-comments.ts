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

const TYPING_TIMEOUT_MS = 4_000;

export async function isOpponentTyping(matchId: string, userId: string) {
  // Find the other participant in the match
  const match = await prisma.ratingMatch.findUnique({
    where: { id: matchId },
    select: { player1Id: true, player2Id: true },
  });
  if (!match) return false;

  const opponentId = match.player1Id === userId ? match.player2Id : match.player1Id;

  const status = await prisma.matchTypingStatus.findUnique({
    where: { matchId_userId: { matchId, userId: opponentId } },
  });

  if (!status) return false;
  return Date.now() - status.lastTypingAt.getTime() < TYPING_TIMEOUT_MS;
}

// Mod-only spectator path — unlike listMatchComments/postMatchComment, this
// doesn't require the caller to be a participant. Callers (server actions/
// pages) are responsible for the MOD/ADMIN role check.
export async function listMatchCommentsAsMod(matchId: string) {
  return prisma.matchComment.findMany({
    where: { matchId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, username: true, avatarUrl: true } } },
  });
}

export async function postMatchCommentAsMod(modUserId: string, matchId: string, body: string) {
  const trimmed = body.trim().slice(0, 500);
  if (!trimmed) throw new Error("Comment can't be empty");
  const match = await prisma.ratingMatch.findUnique({ where: { id: matchId }, select: { id: true } });
  if (!match) throw new Error("Match not found");
  await prisma.matchComment.create({
    data: { matchId, authorId: modUserId, body: `[Mod] ${trimmed}` },
  });
}
