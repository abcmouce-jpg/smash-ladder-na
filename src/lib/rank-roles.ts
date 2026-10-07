import { after } from "next/server";
import { prisma } from "@/lib/db";
import { RANK_TIERS, getRankTier } from "@/lib/rank-tier";
import { sendDiscordWebhookEmbed } from "@/lib/discord-bot";
import { syncTierRoleForDiscordId } from "@/lib/tier-roles";

const SITE_URL = "https://smash-ladder-na.vercel.app";

// Mirrors the tier colors baked into the rank card
// (src/app/players/[id]/opengraph-image.tsx) — Discord role colors and
// embed colors are decimal, not hex, so this is the same palette
// re-expressed for this API instead of a shared hex constant.
const TIER_COLORS: Record<string, number> = {
  Legend: 0xf87171,
  Grandmaster: 0xfacc15,
  Master: 0xa78bfa,
  Elite: 0x60a5fa,
  Fighter: 0x4ade80,
  Trainee: 0xfb923c,
};

export interface TierChangeInfo {
  userId: string;
  discordId: string;
  username: string;
  matchId: string;
  oldTier: string | null;
  newTier: string | null;
}

// Pure and cheap — safe to call from inside a DB transaction, unlike
// applyTierChange below (real network calls, must only run after the
// confirming transaction has committed). gamesBefore is the pre-increment
// count specifically so the provisional-to-tiered reveal (crossing
// PROVISIONAL_GAMES_THRESHOLD on this exact match) is detected correctly —
// using the same gamesPlayed for both sides would hide it.
export function computeTierChange(
  userId: string,
  discordId: string,
  username: string,
  matchId: string,
  ratingBefore: number,
  ratingAfter: number,
  gamesBefore: number,
): TierChangeInfo {
  return {
    userId,
    discordId,
    username,
    matchId,
    oldTier: getRankTier(ratingBefore, gamesBefore)?.name ?? null,
    newTier: getRankTier(ratingAfter, gamesBefore + 1)?.name ?? null,
  };
}

// Whether this player has ever, on some OTHER match, already had a rating
// that would clear tierName's floor — i.e. whether the tier-up this match
// just produced is actually a new personal peak, or just a climb back up
// after an earlier dip. RatingHistory rows are permanent (never deleted or
// overwritten), so "peak rating from every match except this one" is a
// reliable answer regardless of how much the rating has bounced around
// since. Excludes this match's own row by id, not by rating comparison —
// a >= check against the row we're currently evaluating would be
// trivially true and defeat the purpose.
async function hasPreviouslyReachedTier(userId: string, matchId: string, tierName: string): Promise<boolean> {
  const tier = RANK_TIERS.find((t) => t.name === tierName);
  if (!tier) return false;

  const peak = await prisma.ratingHistory.aggregate({
    where: { userId, matchId: { not: matchId } },
    _max: { ratingAfter: true },
  });
  const peakRating = peak._max.ratingAfter;
  return peakRating != null && peakRating >= tier.minRating;
}

// Bottom of RANK_TIERS — reaching it is just the provisional-reveal case
// (nowhere lower to have come from), not an achievement, so it's excluded
// from the rank-up announcement below on purpose: "just reached Trainee"
// reads as an insult, not a celebration.
const LOWEST_TIER = RANK_TIERS[RANK_TIERS.length - 1].name;

// Best-effort, fire-and-forget (see callers — always invoked via
// next/server's after(), never awaited inline with the match-confirm flow
// it's triggered by). Makes the player's Discord tier role match the tier
// this match just landed them in — granting the new tier's role and stripping
// every other tier role, so a player holds exactly one tier role at a time
// (a live reflection of their current rank, not an accumulating "reached this
// tier at least once" list; see syncTierRoleForDiscordId). On a genuine
// tier-UP, never a drop, it also posts a rank-up announcement with their card
// to the community's ladder-updates channel. Tier drops stay silent on the
// announcement side: publicly demoting someone after a losing streak would
// cut against the entire point of this (make the ladder something to show
// off, not something that can embarrass you).
export async function applyTierChange(change: TierChangeInfo) {
  if (change.oldTier === change.newTier) return;

  if (change.discordId) {
    await syncTierRoleForDiscordId(change.discordId, change.newTier);
  }

  const oldIndex = change.oldTier ? RANK_TIERS.findIndex((t) => t.name === change.oldTier) : -1;
  const newIndex = change.newTier ? RANK_TIERS.findIndex((t) => t.name === change.newTier) : -1;
  const wentUp = newIndex !== -1 && (oldIndex === -1 || newIndex < oldIndex);
  if (!wentUp || !change.newTier || change.newTier === LOWEST_TIER) return;

  // Climbing back up to a tier already hit before (after a dip, a losing
  // streak, whatever) isn't a new achievement — only a genuine first-time
  // reach gets the announcement.
  if (await hasPreviouslyReachedTier(change.userId, change.matchId, change.newTier)) return;

  const webhookUrl = process.env.DISCORD_TIER_UP_WEBHOOK_URL;
  if (!webhookUrl) return;

  await sendDiscordWebhookEmbed(webhookUrl, `🎉 **${change.username}** just reached **${change.newTier}**!`, {
    title: change.username,
    url: `${SITE_URL}/players/${change.userId}`,
    color: TIER_COLORS[change.newTier] ?? 0xff6e50,
    // Cache-busting query param — Discord caches an embed image per URL,
    // and this exact URL (no query string) is also the profile's normal
    // link-preview image, quite possibly already cached from an earlier,
    // lower-tier share. The param is otherwise ignored by the route.
    imageUrl: `${SITE_URL}/players/${change.userId}/opengraph-image?v=${Date.now()}`,
  });
}

// Defers applyTierChange to run once the confirming transaction has
// committed, via next/server's after(). after() throws when called
// outside an actual Next.js request scope — which integration tests and
// one-off scripts hit, since they call match-confirm flows directly with
// no request to defer past — so that case is a deliberate no-op (nothing
// to defer to) rather than a bug to work around.
export function deferTierChange(change: TierChangeInfo) {
  try {
    after(() => applyTierChange(change));
  } catch {
    // Outside a request scope — see comment above.
  }
}
