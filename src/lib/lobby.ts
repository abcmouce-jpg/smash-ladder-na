import { prisma, TX_OPTIONS, withTransientRetry } from "@/lib/db";
import { LobbyEntryStatus, MatchStatus, PairingMethod } from "@/generated/prisma/enums";
import { getLatestMatchForUser, getUnresolvedMatchForUser } from "@/lib/matches";
import { sendDiscordDM } from "@/lib/discord-bot";

const LOBBY_ENTRY_TTL_MS = 10 * 60 * 1000; // 10 min queue timeout
const MATCH_TTL_MS = 24 * 60 * 60 * 1000; // no-show / no-report cutoff

export type ActiveLobbyEntry = Awaited<ReturnType<typeof getActiveLobbyEntry>>;

// For the lobby page's live "who's around right now" readout. Waiting is a
// direct RatingLobbyEntry count; in-match goes through RatingMatch.status
// instead of RatingLobbyEntry.status, since PAIRED rows never get cleaned
// up after a match resolves and would overcount actual activity.
export async function getLobbyActivityStats() {
  const [waiting, inMatch] = await Promise.all([
    prisma.ratingLobbyEntry.count({
      where: { status: LobbyEntryStatus.WAITING, expiresAt: { gt: new Date() } },
    }),
    prisma.ratingMatch.count({
      where: { status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED] } },
    }),
  ]);
  return { waiting, inMatch: inMatch * 2 };
}

// Fires after the pairing transaction has already committed — a DM is a
// network call and has no business holding a DB transaction open.
async function notifyMatchPaired(player1Id: string, player2Id: string) {
  const [p1, p2] = await Promise.all([
    prisma.user.findUnique({ where: { id: player1Id }, select: { discordId: true, username: true } }),
    prisma.user.findUnique({ where: { id: player2Id }, select: { discordId: true, username: true } }),
  ]);
  if (p1 && p2) {
    await Promise.all([
      sendDiscordDM(p1.discordId, `🎮 You've been matched with **${p2.username}**! Head to the lobby to get the stage picked.`),
      sendDiscordDM(p2.discordId, `🎮 You've been matched with **${p1.username}**! Head to the lobby to get the stage picked.`),
    ]);
  }
}

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
  // Prefer an actually-unresolved match over "whatever's newest" — a user
  // can have a genuinely stuck PENDING_REPORT match from earlier and a more
  // recently created (already CANCELLED/EXPIRED) one; showing the newer but
  // irrelevant one hid the real match still blocking them from requeuing,
  // since joinLobbyAndTryPair's own block check looks for exactly this.
  const match = (await getUnresolvedMatchForUser(userId)) ?? (await getLatestMatchForUser(userId));

  // A PAIRED entry with no resolvable match at all is orphaned data (e.g.
  // the match record got removed some other way) rather than a real
  // in-progress pairing — nothing in the UI can act on it, so treat it the
  // same as not being in the queue instead of rendering a dead end.
  if (!match) return null;

  return { ...entry, match };
}

export async function joinLobbyAndTryPair(userId: string) {
  const [waitingEntry, unresolvedMatch, me] = await Promise.all([
    prisma.ratingLobbyEntry.findFirst({ where: { userId, status: LobbyEntryStatus.WAITING } }),
    getUnresolvedMatchForUser(userId),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { region: true, crossRegionOk: true } }),
  ]);
  // A resolved (CONFIRMED/DISPUTED) match no longer blocks requeueing, even
  // though its RatingLobbyEntry rows are still sitting there as PAIRED.
  if (waitingEntry || unresolvedMatch) return getActiveLobbyEntry(userId);

  // Matching is same-region by default — both sides have to have picked
  // the same region, so a region has to be set first — but either side can
  // opt into crossRegionOk to accept (or offer) any region instead.
  if (!me.region) {
    throw new Error(
      "Set your region before joining the queue — you'll only be matched with players in the same region unless you opt into cross-region matching.",
    );
  }

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
        ...(me.crossRegionOk ? {} : { OR: [{ user: { region: me.region } }, { user: { crossRegionOk: true } }] }),
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

  if (paired) await notifyMatchPaired(paired.player1Id, paired.player2Id);

  return paired ? getActiveLobbyEntry(userId) : newEntry;
}

// A burst of near-simultaneous joins can each fail to see one another as a
// candidate (nobody else has committed yet when they check) and pile up as
// WAITING even though plenty of mutual partners exist. Rather than only
// pairing opportunistically at join time, the cron finalizer sweeps the
// queue periodically and pairs up whoever's left waiting.
function canMatchRegion(
  a: { region: string | null; crossRegionOk: boolean },
  b: { region: string | null; crossRegionOk: boolean },
) {
  return a.region === b.region || a.crossRegionOk || b.crossRegionOk;
}

export async function sweepLobbyPairing(maxPairs = 50) {
  let paired = 0;
  const now = new Date();

  // Region matching isn't a strict single-bucket split anymore — a
  // crossRegionOk entry can pair with anyone — so straggler pairing greedily
  // scans for the oldest eligible partner per entry instead of grouping by
  // region. The waiting queue is small enough in practice for this to be
  // cheap; read once up front since membership doesn't change mid-sweep.
  const waiting = await prisma.ratingLobbyEntry.findMany({
    where: { status: LobbyEntryStatus.WAITING, expiresAt: { gt: now } },
    orderBy: { joinedAt: "asc" },
    include: { user: { select: { region: true, crossRegionOk: true } } },
  });

  const used = new Set<string>();
  for (let i = 0; i < waiting.length && paired < maxPairs; i++) {
    const a = waiting[i];
    if (used.has(a.id)) continue;

    for (let j = i + 1; j < waiting.length; j++) {
      const b = waiting[j];
      if (used.has(b.id) || !canMatchRegion(a.user, b.user)) continue;

      const madeMatch = await withTransientRetry(() =>
        prisma.$transaction(async (tx) => {
          // Claim both atomically so a join happening at the same moment can't
          // grab one of them out from under this sweep.
          const claim = await tx.ratingLobbyEntry.updateMany({
            where: { id: { in: [a.id, b.id] }, status: LobbyEntryStatus.WAITING },
            data: { status: LobbyEntryStatus.PAIRED, pairingMethod: PairingMethod.AUTO },
          });
          if (claim.count !== 2) return null;

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
          return { player1Id: a.userId, player2Id: b.userId };
        }, TX_OPTIONS),
      );
      if (madeMatch) {
        await notifyMatchPaired(madeMatch.player1Id, madeMatch.player2Id);
        used.add(a.id);
        used.add(b.id);
        paired++;
      }
      break;
    }
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
  // Only the person who actually hosts the in-game arena has a code to
  // enter; the other side just reads it, so only the original setter (or
  // whoever gets there first) can update it — no accidental overwrites.
  if (match.roomCodeSetById && match.roomCodeSetById !== userId) {
    throw new Error("Only the player who entered the room code can change it");
  }
  await prisma.ratingMatch.update({
    where: { id: matchId },
    data: { roomCode, roomCodeSetById: userId },
  });
}
