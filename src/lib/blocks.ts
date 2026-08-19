import { prisma } from "@/lib/db";

export const MAX_BLOCKS_PER_USER = 5;

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw new Error("You can't block yourself");

  const existing = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
  });
  if (existing) return; // already blocked — no-op, doesn't count against the cap again

  // Blocks against a deleted account are excluded from the cap — deleteMyAccount
  // anonymizes rather than removes the row (see its own comment), so the Block
  // row survives and would otherwise permanently occupy a slot against someone
  // who can never be matched against again anyway. discordId's "deleted-"
  // prefix is deleteMyAccount's only marker; there's no separate deleted flag.
  const count = await prisma.block.count({
    where: { blockerId, blocked: { NOT: { discordId: { startsWith: "deleted-" } } } },
  });
  if (count >= MAX_BLOCKS_PER_USER) {
    throw new Error(`You can only block up to ${MAX_BLOCKS_PER_USER} players.`);
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
