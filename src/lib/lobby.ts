import { prisma, TX_OPTIONS, withTransientRetry } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { LobbyEntryStatus, MatchStatus, PairingMethod } from "@/generated/prisma/enums";
import { getLatestMatchForUser, getRoomHostId, getUnresolvedMatchForUser } from "@/lib/matches";
import { getRegionsWithinDistance } from "@/lib/regions";
import { blockPairKey, getAllBlockedPairKeys, getBlockedEitherWayIds } from "@/lib/blocks";
import { MAX_REMATCH_COOLDOWN_HOURS, rematchCooldownAllows } from "@/lib/rematch-cooldown";
import { MATCH_TTL_MS, getMatchGames } from "@/lib/match-games";
import { PROVISIONAL_GAMES_THRESHOLD } from "@/lib/rank-tier";
import { notifyMatchFoundToUsers } from "@/lib/push-server";

function ratingGapAllows(ratingA: number, ratingB: number, maxGap: number | null) {
  return maxGap === null || Math.abs(ratingA - ratingB) <= maxGap;
}

// A brand-new player's maxRatingGap defaults to null ("any rating") — with
// no protection, their very first games could be against a Grandmaster.
// Provisional players (see PROVISIONAL_GAMES_THRESHOLD) get their effective
// gap clamped to this regardless of their own setting; anyone who explicitly
// set something tighter keeps that instead.
export const PROVISIONAL_RATING_GAP_CAP = 300;

function effectiveMaxRatingGap(user: { gamesPlayed: number; maxRatingGap: number | null }) {
  if (user.gamesPlayed >= PROVISIONAL_GAMES_THRESHOLD) return user.maxRatingGap;
  return user.maxRatingGap === null
    ? PROVISIONAL_RATING_GAP_CAP
    : Math.min(user.maxRatingGap, PROVISIONAL_RATING_GAP_CAP);
}

// Not symmetric like distance/rating gap — this checks each side's
// requirement against the OTHER side's actual wiredConnection fact, not a
// shared value both sides have their own tolerance for.
function wiredRequirementAllows(
  a: { wiredConnection: boolean; requireWiredOpponent: boolean },
  b: { wiredConnection: boolean; requireWiredOpponent: boolean },
) {
  return (!a.requireWiredOpponent || b.wiredConnection) && (!b.requireWiredOpponent || a.wiredConnection);
}

// isPracticing lives on the join (RatingLobbyEntry), not the user, since
// it's a per-session choice — avoidPracticeOpponents is the user-level
// setting it's checked against. Symmetric: either side's practice status
// can be blocked by the other's opt-out.
function practiceMatchAllowed(
  a: { isPracticing: boolean; avoidPracticeOpponents: boolean },
  b: { isPracticing: boolean; avoidPracticeOpponents: boolean },
) {
  return (!a.isPracticing || !b.avoidPracticeOpponents) && (!b.isPracticing || !a.avoidPracticeOpponents);
}

// One query covers every candidate's cooldown check for this join attempt:
// every match `userId` played within the longest possible cooldown window,
// collapsed to each opponent's most recent one (results are already newest
// first, so the first hit per opponent wins).
async function getRecentOpponentTimestamps(userId: string) {
  const since = new Date(Date.now() - MAX_REMATCH_COOLDOWN_HOURS * 60 * 60 * 1000);
  const matches = await prisma.ratingMatch.findMany({
    where: { OR: [{ player1Id: userId }, { player2Id: userId }], createdAt: { gte: since } },
    select: { player1Id: true, player2Id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const timestamps = new Map<string, Date>();
  for (const m of matches) {
    const opponentId = m.player1Id === userId ? m.player2Id : m.player1Id;
    if (!timestamps.has(opponentId)) timestamps.set(opponentId, m.createdAt);
  }
  return timestamps;
}

// Same idea as getRecentOpponentTimestamps, but for the whole waiting queue
// at once (sweepLobbyPairing checks many pairs, not just one user's).
async function getRecentMatchPairTimestamps() {
  const since = new Date(Date.now() - MAX_REMATCH_COOLDOWN_HOURS * 60 * 60 * 1000);
  const matches = await prisma.ratingMatch.findMany({
    where: { createdAt: { gte: since } },
    select: { player1Id: true, player2Id: true, createdAt: true },
  });
  const timestamps = new Map<string, Date>();
  for (const m of matches) {
    const key = blockPairKey(m.player1Id, m.player2Id);
    const existing = timestamps.get(key);
    if (!existing || m.createdAt > existing) timestamps.set(key, m.createdAt);
  }
  return timestamps;
}

export const LOBBY_ENTRY_TTL_MS = 10 * 60 * 1000; // 10 min queue timeout

export const ROOM_CODE_PATTERN = /^[A-Z0-9]{5}$/;

// If exactly one side of a pairing already had a room set up before
// queueing, they become host and their code is written straight to the
// match — no "waiting for host" step needed. When both sides brought one,
// the player who joined the queue last keeps theirs; the other side joins
// that room instead of hosting. Only when neither set one do we defer to
// the usual (hash-based) host assignment, returning null for the caller to
// leave roomCode/roomCodeSetById unset.
function resolvePrefilledRoom(
  a: { userId: string; existingRoomCode: string | null; joinedAt: Date },
  b: { userId: string; existingRoomCode: string | null; joinedAt: Date },
): { roomCode: string; roomCodeSetById: string } | null {
  if (a.existingRoomCode && !b.existingRoomCode) {
    return { roomCode: a.existingRoomCode, roomCodeSetById: a.userId };
  }
  if (b.existingRoomCode && !a.existingRoomCode) {
    return { roomCode: b.existingRoomCode, roomCodeSetById: b.userId };
  }
  // Both sides brought a ready room — the last to join hosts with their own
  // code. Equal joinedAt (same-millisecond joins) deterministically falls to a.
  if (a.existingRoomCode && b.existingRoomCode) {
    return b.joinedAt > a.joinedAt
      ? { roomCode: b.existingRoomCode, roomCodeSetById: b.userId }
      : { roomCode: a.existingRoomCode, roomCodeSetById: a.userId };
  }
  return null;
}

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

  // The in-session auto-forfeit resolvers (stale character pick, hanging
  // game report) are lazy — they only run on a getMatchGames call — and
  // they're what flips a live match to CONFIRMED mid-flight. Resolve before
  // reading the match back, or a match that just auto-resolved on this very
  // read still looks in-progress to the lobby: PairedView's ended-state
  // check would be skipped and the winner offered "start the next game" on
  // a set that's actually over (game 5's character-pick timeout showed
  // "Start Game 6 stage striking" instead of the confirmed result) until a
  // later poll happened to re-read the now-CONFIRMED row.
  if (
    match.status !== MatchStatus.CONFIRMED &&
    match.status !== MatchStatus.CANCELLED &&
    match.status !== MatchStatus.EXPIRED
  ) {
    await getMatchGames(match.id);
    const resolved = (await getUnresolvedMatchForUser(userId)) ?? (await getLatestMatchForUser(userId));
    if (!resolved) return null; // orphaned between the two reads — same as above
    return { ...entry, match: resolved };
  }

  return { ...entry, match };
}

// Shared by join-time pairing and the WAITING-poll retry below — both are
// "does a candidate exist for this already-created entry right now" checks,
// differing only in whether the entry was just created or already existed.
async function attemptPairing(params: {
  userId: string;
  myEntry: { id: string; userId: string; isPracticing: boolean; existingRoomCode: string | null; joinedAt: Date };
  myRegion: string;
  me: {
    rating: number;
    rematchCooldownHours: number | null;
    wiredConnection: boolean;
    requireWiredOpponent: boolean;
    avoidPracticeOpponents: boolean;
  };
  myReach: string[];
  myEffectiveGap: number | null;
  blockedIds: string[];
  recentOpponents: Map<string, Date>;
}) {
  const { userId, myEntry, myRegion, me, myReach, myEffectiveGap, blockedIds, recentOpponents } = params;
  return withTransientRetry(() =>
    prisma.$transaction(async (tx) => {
      // Claim myEntry alone first, atomically, before even looking for a
      // candidate. retryPairForWaitingUser can run concurrently for the
      // same entry (multiple tabs, or overlapping 5s polls), and each
      // concurrent call reads its own snapshot of the candidate pool — two
      // calls could each find a *different* still-WAITING candidate and
      // both succeed, leaving this user double-booked into two live
      // matches at once (this happened in prod: a player paired against
      // two different opponents 1.1s apart). A single-row conditional
      // update is unambiguous — count 0 means another concurrent attempt
      // already claimed this entry, so bail before touching anything else.
      const selfClaim = await tx.ratingLobbyEntry.updateMany({
        where: { id: myEntry.id, status: LobbyEntryStatus.WAITING },
        data: { status: LobbyEntryStatus.PAIRED, pairingMethod: PairingMethod.AUTO },
      });
      if (selfClaim.count === 0) return null;

      // Candidates within MY reach on both region and rating — the other half
      // (their own settings covering me back) is checked in JS below, since it
      // depends on each candidate's own values rather than a single filterable
      // column.
      const candidates = await tx.ratingLobbyEntry.findMany({
        where: {
          status: LobbyEntryStatus.WAITING,
          expiresAt: { gt: new Date() },
          userId: { notIn: [userId, ...blockedIds] },
          id: { not: myEntry.id },
          user: {
            region: { in: myReach },
            ...(myEffectiveGap !== null
              ? { rating: { gte: me.rating - myEffectiveGap, lte: me.rating + myEffectiveGap } }
              : {}),
          },
        },
        orderBy: { joinedAt: "asc" },
        take: 20,
        include: {
          user: {
            select: {
              region: true,
              maxMatchDistanceKm: true,
              rating: true,
              maxRatingGap: true,
              gamesPlayed: true,
              rematchCooldownHours: true,
              wiredConnection: true,
              requireWiredOpponent: true,
              avoidPracticeOpponents: true,
            },
          },
        },
      });
      const candidate = candidates.find(
        (c) =>
          getRegionsWithinDistance(c.user.region, c.user.maxMatchDistanceKm).includes(myRegion) &&
          ratingGapAllows(me.rating, c.user.rating, effectiveMaxRatingGap(c.user)) &&
          rematchCooldownAllows(recentOpponents.get(c.userId), me.rematchCooldownHours, c.user.rematchCooldownHours) &&
          wiredRequirementAllows(me, c.user) &&
          practiceMatchAllowed(
            { isPracticing: myEntry.isPracticing, avoidPracticeOpponents: me.avoidPracticeOpponents },
            { isPracticing: c.isPracticing, avoidPracticeOpponents: c.user.avoidPracticeOpponents },
          ),
      );
      // No one to pair with this tick — release the self-claim above so
      // this entry goes back to WAITING instead of getting stuck PAIRED
      // with no match to show for it.
      if (!candidate) {
        await tx.ratingLobbyEntry.update({
          where: { id: myEntry.id },
          data: { status: LobbyEntryStatus.WAITING, pairingMethod: PairingMethod.MANUAL },
        });
        return null;
      }

      // Atomically claim the candidate the same way — if someone else
      // (another concurrent attemptPairing call, from any user) claimed it
      // first, release our own self-claim and bail rather than leaving
      // myEntry stuck PAIRED with nothing to show for it.
      const claim = await tx.ratingLobbyEntry.updateMany({
        where: { id: candidate.id, status: LobbyEntryStatus.WAITING },
        data: { status: LobbyEntryStatus.PAIRED, pairingMethod: PairingMethod.AUTO },
      });
      if (claim.count === 0) {
        await tx.ratingLobbyEntry.update({
          where: { id: myEntry.id },
          data: { status: LobbyEntryStatus.WAITING, pairingMethod: PairingMethod.MANUAL },
        });
        return null;
      }

      const match = await tx.ratingMatch.create({
        data: {
          player1Id: candidate.userId,
          player2Id: userId,
          pairingMethod: PairingMethod.AUTO,
          status: MatchStatus.PENDING_REPORT,
          expiresAt: new Date(Date.now() + MATCH_TTL_MS),
          player1IsPracticing: candidate.isPracticing,
          player2IsPracticing: myEntry.isPracticing,
          ...resolvePrefilledRoom(candidate, myEntry),
        },
      });

      // matchId and pairedEntryId are unique on RatingLobbyEntry, so only the
      // candidate (already claimed above) records them; the joining side is
      // just marked PAIRED and its match is found by player lookup instead.
      await tx.ratingLobbyEntry.update({
        where: { id: candidate.id },
        data: { matchId: match.id, pairedEntryId: myEntry.id },
      });

      return match;
    }, TX_OPTIONS),
  );
}

export async function joinLobbyAndTryPair(
  userId: string,
  isPracticing = false,
  existingRoomCode: string | null = null,
) {
  const [waitingEntry, unresolvedMatch, me, blockedIds, recentOpponents] = await Promise.all([
    prisma.ratingLobbyEntry.findFirst({ where: { userId, status: LobbyEntryStatus.WAITING } }),
    getUnresolvedMatchForUser(userId),
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        region: true,
        maxMatchDistanceKm: true,
        rating: true,
        maxRatingGap: true,
        gamesPlayed: true,
        rematchCooldownHours: true,
        wiredConnection: true,
        requireWiredOpponent: true,
        avoidPracticeOpponents: true,
        queueCooldownUntil: true,
      },
    }),
    getBlockedEitherWayIds(userId),
    getRecentOpponentTimestamps(userId),
  ]);
  // A resolved (CONFIRMED/DISPUTED) match no longer blocks requeueing, even
  // though its RatingLobbyEntry rows are still sitting there as PAIRED.
  if (waitingEntry || unresolvedMatch) return getActiveLobbyEntry(userId);

  if (existingRoomCode && !ROOM_CODE_PATTERN.test(existingRoomCode)) {
    throw new Error("Room code must be exactly 5 characters (A-Z or 0-9)");
  }

  const now = new Date();

  // Escalating penalty for getting auto-forfeited via AFK timeout (see
  // applyTimeoutCooldown) — repeated no-shows shouldn't just cost the
  // ghosted opponent's time with zero consequence for the one who dodged.
  if (me.queueCooldownUntil && me.queueCooldownUntil > now) {
    const minutesLeft = Math.ceil((me.queueCooldownUntil.getTime() - now.getTime()) / (60 * 1000));
    throw new Error(
      `You timed out of your last match — you can queue again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
    );
  }

  // Matching is same-or-nearby-region by default — a region has to be set
  // first so there's something to compare — but either side's own match
  // distance setting can widen (or narrow) how far that reaches.
  const myRegion = me.region;
  if (!myRegion) {
    throw new Error(
      "Set your region before joining the queue — you'll only be matched with players within your chosen match distance.",
    );
  }
  let newEntry: Awaited<ReturnType<typeof prisma.ratingLobbyEntry.create>>;
  try {
    newEntry = await prisma.ratingLobbyEntry.create({
      data: { userId, isPracticing, existingRoomCode, expiresAt: new Date(now.getTime() + LOBBY_ENTRY_TTL_MS) },
    });
  } catch (err) {
    // The waitingEntry check above is a read-then-write race: two concurrent
    // joins (two tabs both clicking Find Match, a double-fired submit) can
    // both pass it and both attempt to create a WAITING entry. The unique
    // partial index on (userId) WHERE status = 'WAITING' makes the second
    // create fail deterministically — treat it exactly like the early return
    // above: the player IS in the queue, so hand back its current state
    // (which the concurrent join may already have paired) instead of an error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return getActiveLobbyEntry(userId);
    }
    throw err;
  }

  const myReach = getRegionsWithinDistance(myRegion, me.maxMatchDistanceKm);
  const myEffectiveGap = effectiveMaxRatingGap(me);

  const paired = await attemptPairing({
    userId,
    myEntry: { id: newEntry.id, userId, isPracticing, existingRoomCode, joinedAt: newEntry.joinedAt },
    myRegion,
    me,
    myReach,
    myEffectiveGap,
    blockedIds,
    recentOpponents,
  });

  // Notify outside the transaction — a push failure must never roll back (or
  // delay) the pairing itself. Best-effort internally (see push-server).
  if (!paired) return newEntry;
  const entry = await getActiveLobbyEntry(userId);
  await notifyMatchFoundToUsers(paired.player1Id, paired.player2Id);
  return entry;
}

// Lets a player already sitting in the queue set or clear the room code they
// brought with them, without having to cancel and rejoin. Same validation as
// join time — the next pairing attempt (retryPairForWaitingUser, the sweep
// cron, or a fresh join-time check) reads existingRoomCode off the live
// entry, so the change is picked up on the very next candidate pass.
export async function updateLobbyRoomCode(userId: string, roomCode: string | null) {
  const entry = await prisma.ratingLobbyEntry.findFirst({
    where: { userId, status: LobbyEntryStatus.WAITING },
    orderBy: { joinedAt: "desc" },
  });
  if (!entry) throw new Error("You're not in the queue.");
  if (roomCode && !ROOM_CODE_PATTERN.test(roomCode)) {
    throw new Error("Room code must be exactly 5 characters (A-Z or 0-9)");
  }
  await prisma.ratingLobbyEntry.update({
    where: { id: entry.id },
    data: { existingRoomCode: roomCode },
  });
}

// The lobby page's client poller (LobbyPoller, 5s interval, kept alive in
// the background specifically while WAITING) re-renders the page constantly
// but previously only re-read status — a candidate who wasn't there at join
// time was invisible until either someone else's join-time check happened to
// notice them, or the 5-minute sweepLobbyPairing cron caught them. That gap
// is most of the p90/p99 tail on wait time. Calling this once per render
// turns the existing 5s poll into a real retry instead of relying on the
// 5-minute cron as the only fallback — same candidate logic as join time
// (attemptPairing), no matching criteria loosened, so match quality doesn't
// degrade just because someone's been waiting longer.
//
// Called straight from the lobby page's server component render (see
// src/app/lobby/page.tsx), so — same contract as notifyMatchFoundToUsers —
// this must never throw: a failed retry should just mean "no pairing found
// this tick," not a broken page for someone who's already anxiously waiting
// on a match. The 5-minute cron sweep is still there as a fallback if a
// retry tick keeps failing.
export async function retryPairForWaitingUser(userId: string) {
  try {
    const now = new Date();
    const entry = await prisma.ratingLobbyEntry.findFirst({
      where: { userId, status: LobbyEntryStatus.WAITING, expiresAt: { gt: now } },
    });
    if (!entry) return;

    const [me, blockedIds, recentOpponents] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          region: true,
          maxMatchDistanceKm: true,
          rating: true,
          maxRatingGap: true,
          gamesPlayed: true,
          rematchCooldownHours: true,
          wiredConnection: true,
          requireWiredOpponent: true,
          avoidPracticeOpponents: true,
        },
      }),
      getBlockedEitherWayIds(userId),
      getRecentOpponentTimestamps(userId),
    ]);
    // Region is required to join in the first place, so this shouldn't be
    // reachable — guard anyway rather than passing null into region matching.
    if (!me.region) return;

    const myReach = getRegionsWithinDistance(me.region, me.maxMatchDistanceKm);
    const myEffectiveGap = effectiveMaxRatingGap(me);

    const paired = await attemptPairing({
      userId,
      myEntry: {
        id: entry.id,
        userId,
        isPracticing: entry.isPracticing,
        existingRoomCode: entry.existingRoomCode,
        joinedAt: entry.joinedAt,
      },
      myRegion: me.region,
      me,
      myReach,
      myEffectiveGap,
      blockedIds,
      recentOpponents,
    });
    if (paired) await notifyMatchFoundToUsers(paired.player1Id, paired.player2Id);
  } catch (err) {
    console.error("retryPairForWaitingUser failed (non-fatal, will retry next poll or cron sweep):", err);
  }
}

// Creates a match and its pair of already-PAIRED lobby entries directly,
// bypassing the WAITING queue entirely — for callers (like a mutual rematch
// request) where the two players are already decided rather than being
// matched from a pool. Only one entry (player1's) records matchId/pairedEntryId,
// same as joinLobbyAndTryPair above — the other side's match is found by
// player lookup via getActiveLobbyEntry. Defaults to non-practice for either
// side — a rematch (the only current caller) passes through whatever each
// player's own setting was on the match being repeated, so it doesn't
// silently flip someone's practice set into one that counts toward their
// real rating.
export async function createDirectMatch(
  tx: Prisma.TransactionClient,
  player1Id: string,
  player2Id: string,
  pairingMethod: PairingMethod,
  player1IsPracticing = false,
  player2IsPracticing = false,
) {
  const now = new Date();
  const match = await tx.ratingMatch.create({
    data: {
      player1Id,
      player2Id,
      pairingMethod,
      status: MatchStatus.PENDING_REPORT,
      expiresAt: new Date(now.getTime() + MATCH_TTL_MS),
      player1IsPracticing,
      player2IsPracticing,
    },
  });

  const entry2 = await tx.ratingLobbyEntry.create({
    data: {
      userId: player2Id,
      status: LobbyEntryStatus.PAIRED,
      pairingMethod,
      isPracticing: player2IsPracticing,
      expiresAt: new Date(now.getTime() + LOBBY_ENTRY_TTL_MS),
    },
  });
  await tx.ratingLobbyEntry.create({
    data: {
      userId: player1Id,
      status: LobbyEntryStatus.PAIRED,
      pairingMethod,
      isPracticing: player1IsPracticing,
      matchId: match.id,
      pairedEntryId: entry2.id,
      expiresAt: new Date(now.getTime() + LOBBY_ENTRY_TTL_MS),
    },
  });

  return match;
}

// A burst of near-simultaneous joins can each fail to see one another as a
// candidate (nobody else has committed yet when they check) and pile up as
// WAITING even though plenty of mutual partners exist. Rather than only
// pairing opportunistically at join time, the cron finalizer sweeps the
// queue periodically and pairs up whoever's left waiting.
type MatchCandidate = {
  region: string | null;
  maxMatchDistanceKm: number | null;
  rating: number;
  maxRatingGap: number | null;
  gamesPlayed: number;
  rematchCooldownHours: number | null;
  wiredConnection: boolean;
  requireWiredOpponent: boolean;
};

function canMatch(a: MatchCandidate, b: MatchCandidate, lastMatchAt: Date | undefined) {
  if (!a.region || !b.region) return false;
  return (
    getRegionsWithinDistance(a.region, a.maxMatchDistanceKm).includes(b.region) &&
    getRegionsWithinDistance(b.region, b.maxMatchDistanceKm).includes(a.region) &&
    ratingGapAllows(a.rating, b.rating, effectiveMaxRatingGap(a)) &&
    ratingGapAllows(a.rating, b.rating, effectiveMaxRatingGap(b)) &&
    rematchCooldownAllows(lastMatchAt, a.rematchCooldownHours, b.rematchCooldownHours) &&
    wiredRequirementAllows(a, b)
  );
}

export async function sweepLobbyPairing(maxPairs = 50) {
  let paired = 0;
  const now = new Date();
  const blockedPairs = await getAllBlockedPairKeys();
  const recentMatchPairs = await getRecentMatchPairTimestamps();

  // Region matching isn't a strict single-bucket split anymore — a wide
  // enough match distance can pair with anyone — so straggler pairing
  // greedily scans for the oldest eligible partner per entry instead of
  // grouping by region. The waiting queue is small enough in practice for
  // this to be cheap; read once up front since membership doesn't change
  // mid-sweep.
  const waiting = await prisma.ratingLobbyEntry.findMany({
    where: { status: LobbyEntryStatus.WAITING, expiresAt: { gt: now } },
    orderBy: { joinedAt: "asc" },
    include: {
      user: {
        select: {
          region: true,
          maxMatchDistanceKm: true,
          rating: true,
          maxRatingGap: true,
          gamesPlayed: true,
          rematchCooldownHours: true,
          wiredConnection: true,
          requireWiredOpponent: true,
          avoidPracticeOpponents: true,
        },
      },
    },
  });

  const used = new Set<string>();
  for (let i = 0; i < waiting.length && paired < maxPairs; i++) {
    const a = waiting[i];
    if (used.has(a.id)) continue;

    for (let j = i + 1; j < waiting.length; j++) {
      const b = waiting[j];
      const pairKey = blockPairKey(a.userId, b.userId);
      if (
        used.has(b.id) ||
        blockedPairs.has(pairKey) ||
        !canMatch(a.user, b.user, recentMatchPairs.get(pairKey)) ||
        !practiceMatchAllowed(
          { isPracticing: a.isPracticing, avoidPracticeOpponents: a.user.avoidPracticeOpponents },
          { isPracticing: b.isPracticing, avoidPracticeOpponents: b.user.avoidPracticeOpponents },
        )
      )
        continue;

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
              player1IsPracticing: a.isPracticing,
              player2IsPracticing: b.isPracticing,
              ...resolvePrefilledRoom(a, b),
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
        used.add(a.id);
        used.add(b.id);
        paired++;
        await notifyMatchFoundToUsers(madeMatch.player1Id, madeMatch.player2Id);
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
  // Room hosting is assigned, not first-come — only the derived host has a
  // code to enter, the other side just reads it. See getRoomHostId.
  if (getRoomHostId(match) !== userId) {
    throw new Error("Only the assigned host can set the room code");
  }
  if (!/^[A-Z0-9]{5}$/.test(roomCode)) {
    throw new Error("Room code must be exactly 5 characters (A-Z or 0-9)");
  }
  await prisma.ratingMatch.update({
    where: { id: matchId },
    data: { roomCode, roomCodeSetById: userId },
  });
}
