// One-off reconciliation: a Discord tier role is meant to reflect a player's
// CURRENT tier (see src/lib/tier-roles.ts), but the sync used to be additive
// and event-driven — it only ever granted a role, and only when a match
// happened to cross a tier boundary. Accounts therefore drifted into holding
// several tier roles at once, or a stale one from a tier they no longer sit in
// (missed sync, accounts that predate the feature, season resets). This walks
// every real account, works out its current tier from its live rating, and sets
// its tier roles to exactly that one, clearing any others. Safe to re-run: it
// always reads the current rating and states the full desired role set.
//
// Usage:
//   DATABASE_URL=<prod> DISCORD_BOT_TOKEN=<token> \
//   DISCORD_COMMUNITY_GUILD_ID=<guild> DISCORD_TIER_ROLE_IDS='{"Legend":"<id>",...}' \
//   npx tsx scripts/reconcile-tier-roles.ts
import { prisma } from "../src/lib/db";
import { getRankTier } from "../src/lib/rank-tier";
import { syncTierRoleForDiscordId, tierRoleIds } from "../src/lib/tier-roles";

// Synthetic ids that were never real Discord snowflakes — see deleteMyAccount
// (deleted-*), auth.ts's dev-credentials path (dev-*), and the practice-bot
// seed accounts (practice-*). None of them are guild members to reconcile.
const SYNTHETIC_ID_PREFIXES = ["deleted-", "dev-", "practice-"];

// Discord rate-limits the per-member role endpoints at a strict per-second
// bucket; staying a little under the documented 5/sec leaves headroom for the
// live site sharing the same bot token.
const REQUESTS_PER_SECOND = 4;
const DELAY_MS = 1000 / REQUESTS_PER_SECOND;

async function main() {
  if (!process.env.DISCORD_COMMUNITY_GUILD_ID) {
    throw new Error("DISCORD_COMMUNITY_GUILD_ID is required");
  }
  if (tierRoleIds().length === 0) {
    throw new Error('DISCORD_TIER_ROLE_IDS must be a non-empty { "Tier": "<role id>" } map');
  }

  const users = await prisma.user.findMany({
    select: { id: true, discordId: true, rating: true, gamesPlayed: true },
  });
  const targets = users.filter((u) => !SYNTHETIC_ID_PREFIXES.some((p) => u.discordId.startsWith(p)));

  console.log(
    `Reconciling tier roles for ${targets.length} accounts (${users.length - targets.length} synthetic ids skipped)...`,
  );

  for (const [i, user] of targets.entries()) {
    const tier = getRankTier(user.rating, user.gamesPlayed)?.name ?? null;
    await syncTierRoleForDiscordId(user.discordId, tier);
    if ((i + 1) % 100 === 0) {
      console.log(`${i + 1}/${targets.length}...`);
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
