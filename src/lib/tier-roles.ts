import { syncDiscordGuildMemberRoles } from "@/lib/discord-bot";

// JSON blob of { "Legend": "<role id>", ... } — set once when the tier roles
// are created on the community Discord server (see project notes; there's no
// in-app role-creation flow, this just maps to whatever already exists).
// Unset or missing entries mean "skip the Discord side silently" rather than
// error, same as every other optional Discord integration in this codebase.
export function tierRoleId(tierName: string): string | null {
  try {
    const map = JSON.parse(process.env.DISCORD_TIER_ROLE_IDS ?? "{}") as Record<string, string>;
    return map[tierName] ?? null;
  } catch {
    return null;
  }
}

// Every configured tier role id, regardless of which tier it belongs to. Used
// to strip the stale ones when a member moves to a new tier — a player holds
// the role for their CURRENT tier only (see syncTierRoleForDiscordId), so a
// change means removing whatever other tier role they were carrying.
export function tierRoleIds(): readonly string[] {
  try {
    const map = JSON.parse(process.env.DISCORD_TIER_ROLE_IDS ?? "{}") as Record<string, string>;
    return Object.values(map).filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

// Makes a member's Discord tier roles match exactly `tierName` (or none, when
// null): grants that tier's role and strips every other tier role. This is
// the authoritative "current tier" sync — rather than a from->to delta it
// states the desired end state outright, so re-running it (a backfill, a
// season rollover, a repair of roles that drifted) converges on the same
// correct result instead of layering another grant on top. No-op when the
// guild or the tier-role map isn't configured, same as every other optional
// Discord integration.
export async function syncTierRoleForDiscordId(discordId: string, tierName: string | null) {
  const guildId = process.env.DISCORD_COMMUNITY_GUILD_ID;
  const all = tierRoleIds();
  if (!guildId || !discordId || all.length === 0) return;

  const target = tierName ? tierRoleId(tierName) : null;
  await syncDiscordGuildMemberRoles(
    guildId,
    discordId,
    target ? [target] : [],
    all.filter((id) => id !== target),
  );
}

// Strips every tier role from each given member — the season-rollover case,
// where rating resets to provisional for everyone, so nobody is entitled to a
// tier role until they've been re-ranked in the new season. Sequential with a
// delay because this fans out to the whole playerbase in one go, and Discord
// rate-limits the per-member role endpoints.
export async function stripTierRolesForDiscordIds(discordIds: readonly string[], delayMs = 100) {
  if (!process.env.DISCORD_COMMUNITY_GUILD_ID || tierRoleIds().length === 0) return;
  for (const discordId of discordIds) {
    await syncTierRoleForDiscordId(discordId, null);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
