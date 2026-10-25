import { prisma } from "@/lib/db";
import { DELETED_USERNAME } from "@/lib/account";
import { LocalizedError } from "@/lib/localized-error";

// Raised from 5 on 2026-10-21 after a player pointed out that the cap and the
// permanence compound: blocks are never cleared — not by a season rollover,
// which zeroes ratings and gamesPlayed but leaves Block rows alone — so a slot
// spent on a misclick or on a one-off bad game in Season 1 is gone for good.
// At five that meant the cap tightened the longer someone played, which
// punished exactly the people who stayed. Ten keeps blocking a deliberate act
// rather than a toggle while leaving room to be wrong a couple of times.
export const MAX_BLOCKS_PER_USER = 10;

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId)
    throw new LocalizedError({
      en: "You can't block yourself",
      es: "No puedes bloquearte a ti mismo",
      ja: "自分をブロックすることはできません",
    });

  const existing = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
  });
  if (existing) return; // already blocked — no-op, doesn't count against the cap again

  // Blocks against a deleted account are excluded from the cap — deleteMyAccount
  // anonymizes rather than removes the row (see its own comment), so the Block
  // row survives and would otherwise permanently occupy a slot against someone
  // who can never be matched against again anyway. Keyed on the row's current
  // username rather than discordId, since signing back in with the same
  // Discord account resumes this same (still-anonymized) row instead of
  // forking a new one — if they later rename away from "Deleted User", they're
  // reachable again and a block on them should count against the cap again too.
  const count = await prisma.block.count({
    where: { blockerId, blocked: { NOT: { username: DELETED_USERNAME } } },
  });
  if (count >= MAX_BLOCKS_PER_USER) {
    throw new LocalizedError({
      en: `You can only block up to ${MAX_BLOCKS_PER_USER} players.`,
      es: `Solo puedes bloquear hasta ${MAX_BLOCKS_PER_USER} jugadores.`,
      ja: `ブロックできるのは${MAX_BLOCKS_PER_USER}人までです。`,
    });
  }

  await prisma.block.create({ data: { blockerId, blockedId } });
}

// Blocks are permanent by design — there's no unblockUser. This keeps the
// cap meaningful (a real commitment, not a toggle) and means matchmaking
// exclusions can't be quietly undone by whoever's on the receiving end of a
// dispute.
export async function isBlockedByMe(blockerId: string, blockedId: string) {
  const block = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
  });
  return block !== null;
}

export async function listBlockedUsers(blockerId: string) {
  return prisma.block.findMany({
    where: { blockerId },
    orderBy: { createdAt: "desc" },
    include: { blocked: { select: { id: true, username: true, avatarUrl: true } } },
  });
}

// Matchmaking treats a block as mutual either way — if either side blocked
// the other, they shouldn't be paired, regardless of who queues first.
export async function getBlockedEitherWayIds(userId: string) {
  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId));
}

export function blockPairKey(userAId: string, userBId: string) {
  return userAId < userBId ? `${userAId}|${userBId}` : `${userBId}|${userAId}`;
}

// For sweepLobbyPairing's O(n^2) scan — one query up front instead of one
// per candidate pair.
export async function getAllBlockedPairKeys() {
  const blocks = await prisma.block.findMany({ select: { blockerId: true, blockedId: true } });
  return new Set(blocks.map((b) => blockPairKey(b.blockerId, b.blockedId)));
}
