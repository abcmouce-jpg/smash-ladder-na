import { checkGuildMembership } from "@/lib/discord-bot";
import { COMMUNITY_GUILD_ID } from "@/lib/links";

// TEMP — remove after the 2026-09-30/10-01 Discord-gate incident is closed out.
export async function GET(req: Request) {
  const discordId = new URL(req.url).searchParams.get("discordId");
  if (!discordId) return Response.json({ error: "missing discordId" }, { status: 400 });
  const result = await checkGuildMembership(COMMUNITY_GUILD_ID, discordId);
  return Response.json({ discordId, guildId: COMMUNITY_GUILD_ID, isMember: result });
}
