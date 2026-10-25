// Site-wide external links. Update a value here to change it everywhere
// (home page, footer, FAQ).
export const DISCORD_SERVER_URL = "https://discord.gg/zE8B44vQxf";
export const KOFI_URL = "https://ko-fi.com/mattekudasai";

// Where players reach the team. The Japanese instance has no Discord server of
// its own, so its pages point here instead of at a server it does not run.
// Env-driven so a second instance can name its own account without a code
// change; the fallback is the account that exists today.
export const X_ACCOUNT_URL = process.env.NEXT_PUBLIC_X_ACCOUNT_URL?.trim() || "https://x.com/SmashLadder_NA";

// Resolved from the invite code above (GET /invites/{code}) — the community
// server's guild id, for the bot's membership check in auth.ts. Only changes
// if the server itself is ever recreated, not when the invite link does.
export const COMMUNITY_GUILD_ID = "1528476162421031063";
