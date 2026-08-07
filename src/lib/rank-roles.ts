import { after } from "next/server";
import { RANK_TIERS, getRankTier } from "@/lib/rank-tier";
import { syncDiscordGuildMemberRole, sendDiscordWebhookEmbed } from "@/lib/discord-bot";

const SITE_URL = "https://smash-ladder-na.vercel.app";

// Mirrors the tier colors baked into the rank card
// (src/app/players/[id]/opengraph-image.tsx) — Discord role colors and
// embed colors are decimal, not hex, so this is the same palette
// re-expressed for this API instead of a shared hex constant.
const TIER_COLORS: Record<string, number> = {
  Legend: 0xfb7185,
  Grandmaster: 0xfacc15,
  Master: 0xa78bfa,
  Elite: 0x60a5fa,
  Fighter: 0x38bdf8,
  Challenger: 0xfb923c,
};

function tierRoleId(tierName: string): string | null {
  // JSON blob of { "Legend": "<role id>", ... } — set once when the tier
  // roles are created on the community Discord server (see project notes;
  // there's no in-app role-creation flow, this just maps to whatever
  // already exists). Unset or missing entries mean "skip the Discord side
  // silently" rather than error, same as every other optional Discord
  // integration in this codebase.
  try {
    const map = JSON.parse(process.env.DISCORD_TIER_ROLE_IDS ?? "{}") as Record<string, string>;
    return map[tierName] ?? null;
  } catch {
    return null;
  }
}

export interface TierChangeInfo {
  userId: string;
  discordId: string;
  username: string;
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
  ratingBefore: number,
  ratingAfter: number,
  gamesBefore: number,
): TierChangeInfo {
  return {
    userId,
    discordId,
    username,
    oldTier: getRankTier(ratingBefore, gamesBefore)?.name ?? null,
    newTier: getRankTier(ratingAfter, gamesBefore + 1)?.name ?? null,
  };
}

// Bottom of RANK_TIERS — reaching it is just the provisional-reveal case
// (nowhere lower to have come from), not an achievement, so it's excluded
// from the rank-up announcement below on purpose: "just reached Challenger"
// reads as an insult, not a celebration.
const LOWEST_TIER = RANK_TIERS[RANK_TIERS.length - 1].name;

// Best-effort, fire-and-forget (see callers — always invoked via
// next/server's after(), never awaited inline with the match-confirm flow
// it's triggered by). Keeps the player's Discord tier role in sync, and —
// only on a genuine tier-UP, never a drop — posts a rank-up announcement
// with their card to the community's ladder-updates channel. Tier drops
// stay silent on purpose: publicly demoting someone after a losing streak
// would cut against the entire point of this (make the ladder something to
// show off, not something that can embarrass you).
export async function applyTierChange(change: TierChangeInfo) {
  if (change.oldTier === change.newTier) return;

  const guildId = process.env.DISCORD_COMMUNITY_GUILD_ID;
  if (guildId && change.discordId) {
    await syncDiscordGuildMemberRole(
      guildId,
      change.discordId,
      change.newTier ? tierRoleId(change.newTier) : null,
      change.oldTier ? tierRoleId(change.oldTier) : null,
    );
  }

  const oldIndex = change.oldTier ? RANK_TIERS.findIndex((t) => t.name === change.oldTier) : -1;
  const newIndex = change.newTier ? RANK_TIERS.findIndex((t) => t.name === change.newTier) : -1;
  const wentUp = newIndex !== -1 && (oldIndex === -1 || newIndex < oldIndex);
  if (!wentUp || !change.newTier || change.newTier === LOWEST_TIER) return;

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
