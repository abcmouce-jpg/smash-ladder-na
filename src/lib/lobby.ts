import { prisma, TX_OPTIONS, withTransientRetry } from "@/lib/db";
import { LobbyEntryStatus, MatchStatus, PairingMethod } from "@/generated/prisma/enums";
import { getLatestMatchForUser, getUnresolvedMatchForUser } from "@/lib/matches";

const LOBBY_ENTRY_TTL_MS = 10 * 60 * 1000; // 10 min queue timeout
const MATCH_TTL_MS = 24 * 60 * 60 * 1000; // no-show / no-report cutoff

export type ActiveLobbyEntry = Awaited<ReturnType<typeof getActiveLobbyEntry>>;

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
  const match = await getLatestMatchForUser(userId);
  return { ...entry, match };
}

export async function joinLobbyAndTryPair(userId: string) {
  const [waitingEntry, unresolvedMatch] = await Promise.all([
    prisma.ratingLobbyEntry.findFirst({ where: { userId, status: LobbyEntryStatus.WAITING } }),
    getUnresolvedMatchForUser(userId),
  ]);
  // A resolved (CONFIRMED/DISPUTED) match no longer blocks requeueing, even
  // though its RatingLobbyEntry rows are still sitting there as PAIRED.
  if (waitingEntry || unresolvedMatch) return getActiveLobbyEntry(userId);

  const now = new Date();
  const newEntry = await prisma.ratingLobbyEntry.create({
    data: { userId, expiresAt: new Date(now.getTime() + LOBBY_ENTRY_TTL_MS) },
  });

  const paired = await withTransientRetry(() => prisma.$transaction(async (tx) => {
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
  }, TX_OPTIONS));

  return paired ? getActiveLobbyEntry(userId) : newEntry;
}

// A burst of near-simultaneous joins can each fail to see one another as a
// candidate (nobody else has committed yet when they check) and pile up as
// WAITING even though plenty of mutual partners exist. Rather than only
// pairing opportunistically at join time, the cron finalizer sweeps the
// queue periodically and pairs up whoever's left waiting.
export async function sweepLobbyPairing(maxPairs = 50) {
  let paired = 0;
  for (let i = 0; i < maxPairs; i++) {
    const now = new Date();
    const madeMatch = await withTransientRetry(() =>
      prisma.$transaction(async (tx) => {
        const [a, b] = await tx.ratingLobbyEntry.findMany({
          where: { status: LobbyEntryStatus.WAITING, expiresAt: { gt: now } },
          orderBy: { joinedAt: "asc" },
          take: 2,
        });
        if (!a || !b) return false;

        // Claim both atomically so a join happening at the same moment can't
        // grab one of them out from under this sweep.
        const claim = await tx.ratingLobbyEntry.updateMany({
          where: { id: { in: [a.id, b.id] }, status: LobbyEntryStatus.WAITING },
          data: { status: LobbyEntryStatus.PAIRED, pairingMethod: PairingMethod.AUTO },
        });
        if (claim.count !== 2) return false;

        const match = await tx.ratingMatch.create({
          data: {
            player1Id: a.userId,
            player2Id: b.userId,
            pairingMethod: PairingMethod.AUTO,
            status: MatchStatus.PENDING_REPORT,
            expiresAt: new Date(now.getTime() + MATCH_TTL_MS),
          },
        });
        // Only one side records matchId/pairedEntryId — see the join-time
        // pairing above for why (unique per RatingLobbyEntry).
        await tx.ratingLobbyEntry.update({
          where: { id: a.id },
          data: { matchId: match.id, pairedEntryId: b.id },
        });
        return true;
      }, TX_OPTIONS),
    );
    if (!madeMatch) break;
    paired++;
  }
  return paired;
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
