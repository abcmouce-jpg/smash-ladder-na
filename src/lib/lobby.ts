import { prisma } from "@/lib/db";
import { LobbyEntryStatus, MatchStatus, PairingMethod } from "@/generated/prisma/enums";

const LOBBY_ENTRY_TTL_MS = 10 * 60 * 1000; // 10 min queue timeout
const MATCH_TTL_MS = 24 * 60 * 60 * 1000; // no-show / no-report cutoff, reporting flow lands separately

export type ActiveLobbyEntry = Awaited<ReturnType<typeof getActiveLobbyEntry>>;

const matchWithPlayers = {
  player1: { select: { id: true, username: true, avatarUrl: true, rating: true } },
  player2: { select: { id: true, username: true, avatarUrl: true, rating: true } },
} as const;

export async function getActiveLobbyEntry(userId: string) {
  const entry = await prisma.ratingLobbyEntry.findFirst({
    where: {
      userId,
      status: { in: [LobbyEntryStatus.WAITING, LobbyEntryStatus.PAIRED] },
    },
    orderBy: { joinedAt: "desc" },
  });
  if (!entry) return null;
  if (entry.status !== LobbyEntryStatus.PAIRED) return { ...entry, match: null };

  // matchId lives on only one side of the pair (it's unique per RatingLobbyEntry),
  // so the paired-but-not-owning side looks its match up by player instead.
  const match = await prisma.ratingMatch.findFirst({
    where: {
      OR: [{ player1Id: userId }, { player2Id: userId }],
      status: MatchStatus.PENDING_REPORT,
    },
    orderBy: { createdAt: "desc" },
    include: matchWithPlayers,
  });

  return { ...entry, match };
}

export async function joinLobbyAndTryPair(userId: string) {
  const existing = await getActiveLobbyEntry(userId);
  if (existing) return existing;

  const now = new Date();
  const newEntry = await prisma.ratingLobbyEntry.create({
    data: { userId, expiresAt: new Date(now.getTime() + LOBBY_ENTRY_TTL_MS) },
  });

  const paired = await prisma.$transaction(async (tx) => {
    const candidate = await tx.ratingLobbyEntry.findFirst({
      where: {
        status: LobbyEntryStatus.WAITING,
        expiresAt: { gt: now },
        userId: { not: userId },
        id: { not: newEntry.id },
      },
      orderBy: { joinedAt: "asc" },
    });
    if (!candidate) return null;

    // Atomically claim the candidate so two concurrent joins can't pair with the same entry.
    const claim = await tx.ratingLobbyEntry.updateMany({
      where: { id: candidate.id, status: LobbyEntryStatus.WAITING },
      data: { status: LobbyEntryStatus.PAIRED, pairingMethod: PairingMethod.AUTO },
    });
    if (claim.count === 0) return null;

    const match = await tx.ratingMatch.create({
      data: {
        player1Id: candidate.userId,
        player2Id: userId,
        pairingMethod: PairingMethod.AUTO,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(now.getTime() + MATCH_TTL_MS),
      },
    });

    // matchId and pairedEntryId are unique on RatingLobbyEntry, so only the
    // candidate (already claimed above) records them; the joining side is
    // just marked PAIRED and its match is found by player lookup instead.
    await tx.ratingLobbyEntry.update({
      where: { id: candidate.id },
      data: { matchId: match.id, pairedEntryId: newEntry.id },
    });
    await tx.ratingLobbyEntry.update({
      where: { id: newEntry.id },
      data: { status: LobbyEntryStatus.PAIRED, pairingMethod: PairingMethod.AUTO },
    });

    return match;
  });

  return paired ? getActiveLobbyEntry(userId) : newEntry;
}

export async function cancelLobbyEntry(userId: string) {
  await prisma.ratingLobbyEntry.updateMany({
    where: { userId, status: LobbyEntryStatus.WAITING },
    data: { status: LobbyEntryStatus.CANCELLED, cancelledAt: new Date() },
  });
}

export async function setMatchRoomCode(userId: string, matchId: string, roomCode: string) {
  const match = await prisma.ratingMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Match not found");
  if (match.player1Id !== userId && match.player2Id !== userId) {
    throw new Error("Not a participant in this match");
  }
  await prisma.ratingMatch.update({ where: { id: matchId }, data: { roomCode } });
}
