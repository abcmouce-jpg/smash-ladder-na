import { prisma } from "@/lib/db";
import { PostStatus } from "@/generated/prisma/enums";
import { sendDiscordDM, sendDiscordWebhookMessage, deleteDiscordWebhookMessage } from "@/lib/discord-bot";
import { FREE_BATTLE_TIERS, hasReachedTier, type FreeBattleTier } from "@/lib/rank-tier";
import { tierRoleId } from "@/lib/rank-roles";
import { getPeakRating } from "@/lib/players";
import { SMASH_CHARACTERS, echoGroupMembers, type SmashCharacter } from "@/lib/characters";
import { getRegionsWithinDistance, MATCH_DISTANCE_PRESETS } from "@/lib/regions";

// One #<tier>-grind channel per restricted tier, each with its own webhook
// (Channel Settings → Integrations → Webhooks) so a restricted post only
// pings the players who can actually claim it — same "unset = skip
// silently" pattern as DISCORD_FREE_BATTLE_WEBHOOK_URL below.
function webhookUrlForTier(minTier: FreeBattleTier | null): string | undefined {
  if (!minTier) return process.env.DISCORD_FREE_BATTLE_WEBHOOK_URL;
  return process.env[`DISCORD_FREE_BATTLE_${minTier.toUpperCase()}_WEBHOOK_URL`];
}

async function requireReachedTier(userId: string, minTier: FreeBattleTier) {
  const peak = await getPeakRating(userId);
  if (!hasReachedTier(peak, minTier)) {
    throw new Error(`You need to have reached ${minTier} at least once to post this`);
  }
}

// Best-effort teardown of a post's Discord announcement, if it has one and
// the webhook is still configured — shared by closePost, claimPost, and the
// expiry finalizer so a post's Discord footprint never outlives it. Needs
// the same minTier the post was created with — a webhook can only delete
// its own messages, so deleting a tier-channel announcement through the
// general webhook (or vice versa) would silently fail and leave it stuck.
export async function deletePostAnnouncement(discordMessageId: string | null, minTier: FreeBattleTier | null = null) {
  const webhookUrl = webhookUrlForTier(minTier);
  if (webhookUrl && discordMessageId) {
    await deleteDiscordWebhookMessage(webhookUrl, discordMessageId);
  }
}

const POST_TTL_MS = 24 * 60 * 60 * 1000;

const authorSelect = {
  author: { select: { id: true, username: true, avatarUrl: true, rating: true } },
} as const;

export interface FreeBattleFilters {
  character?: string | null;
  // The viewer's own region and how far from it to search — mirrors the
  // ranked Lobby's own distance-based matching (see MATCH_DISTANCE_PRESETS)
  // rather than an exact/broad region string match. null/undefined maxKm
  // (as opposed to a real number, including 0) means "no distance filter".
  viewerRegion?: string | null;
  maxDistanceKm?: number | null;
}

export async function listOpenPosts(excludeUserId: string, filters: FreeBattleFilters = {}) {
  return prisma.freeBattlePost.findMany({
    where: {
      status: PostStatus.OPEN,
      expiresAt: { gt: new Date() },
      authorId: { not: excludeUserId },
      // Matches the post's own self-declared tags (see createPost), not the
      // author's profile character — a post's tags are what it's actually
      // about, which can differ from what the author mains overall. Echo
      // fighters (Lucina/Marth is NOT one — see ECHO_FIGHTER_GROUPS —  but
      // Peach/Daisy etc. are) still count as the same character either way.
      ...(filters.character
        ? { characters: { hasSome: echoGroupMembers(filters.character as SmashCharacter) as string[] } }
        : {}),
      // Distance from the viewer's own region, using the same coordinate
      // math the ranked Lobby's matching uses — a real number (including 0,
      // "same region only") filters; null/undefined leaves posts unfiltered
      // by region entirely.
      ...(typeof filters.maxDistanceKm === "number"
        ? { region: { in: getRegionsWithinDistance(filters.viewerRegion ?? null, filters.maxDistanceKm) } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: authorSelect,
  });
}

// Which of FREE_BATTLE_TIERS this player can actually restrict a post to —
// drives which options the post form offers, and (via hasReachedTier) which
// open posts they're allowed to claim.
export async function getAchievedFreeBattleTiers(userId: string): Promise<FreeBattleTier[]> {
  const peak = await getPeakRating(userId);
  return FREE_BATTLE_TIERS.filter((tier) => hasReachedTier(peak, tier));
}

export async function getOwnActivePost(userId: string) {
  return prisma.freeBattlePost.findFirst({
    where: { authorId: userId, status: { in: [PostStatus.OPEN, PostStatus.MATCHED] } },
    orderBy: { createdAt: "desc" },
    include: authorSelect,
  });
}

// Label for a self-declared distance preference, matching the Lobby's own
// MATCH_DISTANCE_PRESETS wording — undefined/null both read as "no
// preference stated" (falls out of the Discord tags entirely) rather than
// a preset with no matching label.
function distanceLabel(maxDistanceKm: number | null | undefined): string | null {
  if (maxDistanceKm == null) return null;
  return MATCH_DISTANCE_PRESETS.find((p) => p.km === maxDistanceKm)?.label ?? `Within ${maxDistanceKm}km`;
}

export async function createPost(
  userId: string,
  comment: string,
  minTier: FreeBattleTier | null = null,
  characters: string[] = [],
  maxDistanceKm: number | null = null,
) {
  const existing = await getOwnActivePost(userId);
  if (existing) throw new Error("You already have an active post");

  const trimmed = comment.trim();
  if (!trimmed) throw new Error("Comment is required");

  if (minTier && !FREE_BATTLE_TIERS.includes(minTier)) throw new Error("Invalid rank restriction");
  if (minTier) await requireReachedTier(userId, minTier);

  // Deduped and validated against the real roster rather than trusted as
  // typed — this is form input, not a value the UI can guarantee. Silently
  // drops anything invalid rather than erroring, since these are just
  // descriptive tags with nothing to get "wrong" about them.
  const dedupedCharacters = [...new Set(characters)].filter((c) =>
    (SMASH_CHARACTERS as readonly string[]).includes(c),
  );

  // Region comes from the player's own profile (set on the Lobby page) so
  // it stays consistent with the structured MATCH_REGIONS list used for
  // ranked pairing, instead of a separate free-text field going stale.
  const author = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { region: true, username: true },
  });

  const post = await prisma.freeBattlePost.create({
    data: {
      authorId: userId,
      comment: trimmed,
      region: author.region,
      minTier,
      characters: dedupedCharacters,
      maxDistanceKm,
      expiresAt: new Date(Date.now() + POST_TTL_MS),
    },
  });

  // Growth lever from the player-acquisition research: the friction in Free
  // Battle isn't the feature, it's that nobody outside the site sees the
  // post the moment it goes up. Mirroring it into Discord (where the
  // community already hangs out) turns "browse the site to find a game"
  // into "see a ping, jump in" — the exact "someone else is playing right
  // now" signal that drives return visits. A tier-restricted post mirrors
  // into that tier's own #<tier>-grind channel instead of the general one,
  // pinging that channel's rank role so it reaches players who can actually
  // claim it (see rank-roles.ts — same role IDs the tier-up announcement
  // and the "@Elite ping in here" channel convention already use).
  const webhookUrl = webhookUrlForTier(minTier);
  if (webhookUrl) {
    const roleId = minTier ? tierRoleId(minTier) : null;
    const rolePrefix = roleId ? `<@&${roleId}> ` : "";
    const tags = [
      minTier ? `${minTier}+` : null,
      dedupedCharacters.join("/") || null,
      author.region,
      distanceLabel(maxDistanceKm),
    ]
      .filter(Boolean)
      .join(", ");
    const tagSuffix = tags ? ` (${tags})` : "";
    const messageId = await sendDiscordWebhookMessage(
      webhookUrl,
      `${rolePrefix}🎮 **${author.username}** is looking for a free battle${tagSuffix}: "${trimmed}"\nhttps://smash-ladder-na.vercel.app/free-battle`,
    );
    // Recorded after the fact rather than in the initial create — the
    // message doesn't exist (so has no id) until after the post row does.
    // Best-effort: a missing id here just means deletePostAnnouncement has
    // nothing to delete later, not a broken post.
    if (messageId) {
      await prisma.freeBattlePost.update({ where: { id: post.id }, data: { discordMessageId: messageId } });
    }
  }

  return post;
}

export async function closePost(userId: string, postId: string) {
  const closed = await prisma.freeBattlePost.updateMany({
    // MATCHED must be closable too, not just OPEN — otherwise a claimed
    // post counts as "active" forever (per getOwnActivePost) and the
    // author can never post again.
    where: { id: postId, authorId: userId, status: { in: [PostStatus.OPEN, PostStatus.MATCHED] } },
    data: { status: PostStatus.CLOSED },
  });
  if (closed.count > 0) {
    const post = await prisma.freeBattlePost.findUnique({
      where: { id: postId },
      select: { discordMessageId: true, minTier: true },
    });
    await deletePostAnnouncement(post?.discordMessageId ?? null, post?.minTier as FreeBattleTier | null);
  }
}

// matchedWithId has no Prisma relation defined on it, so it's looked up separately.
export async function getUserBrief(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, avatarUrl: true, rating: true },
  });
}

export async function claimPost(userId: string, postId: string) {
  const post = await prisma.freeBattlePost.findUnique({ where: { id: postId } });
  if (!post) throw new Error("Post not found");
  if (post.authorId === userId) throw new Error("You can't claim your own post");
  // Belt-and-suspenders alongside the disabled "I'm in" button in the UI —
  // that's just a display hint, this is the actual gate.
  if (post.minTier) await requireReachedTier(userId, post.minTier as FreeBattleTier);

  // Conditional update so two claimants racing for the same post can't both win.
  const claim = await prisma.freeBattlePost.updateMany({
    where: { id: postId, status: PostStatus.OPEN },
    data: { status: PostStatus.MATCHED, matchedWithId: userId, matchedAt: new Date() },
  });
  if (claim.count === 0) throw new Error("This post was just claimed by someone else");

  await deletePostAnnouncement(post.discordMessageId, post.minTier as FreeBattleTier | null);

  const [author, claimer] = await Promise.all([
    prisma.user.findUnique({ where: { id: post.authorId }, select: { discordId: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
  ]);
  if (author && claimer) {
    await sendDiscordDM(author.discordId, `🙋 ${claimer.username} is in on your free battle post!`);
  }
}
