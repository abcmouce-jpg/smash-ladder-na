const DISCORD_API = "https://discord.com/api/v10";

async function discordRequest(path: string, init: RequestInit) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  return fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

// Best-effort only: a DM can fail for reasons entirely outside our control
// (the bot and recipient don't share a Discord server, the user has DMs
// from server members turned off, etc.), so a failure here must never break
// whatever gameplay action triggered it — swallow and move on.
export async function sendDiscordDM(discordId: string, content: string) {
  try {
    const channelRes = await discordRequest("/users/@me/channels", {
      method: "POST",
      body: JSON.stringify({ recipient_id: discordId }),
    });
    if (!channelRes?.ok) return;
    const channel = (await channelRes.json()) as { id: string };

    await discordRequest(`/channels/${channel.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: content.slice(0, 1900) }),
    });
  } catch {
    // Notifications are a nice-to-have, not a dependency of the core flow.
  }
}
