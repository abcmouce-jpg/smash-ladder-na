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

// Sends to many recipients one at a time instead of firing them all at once —
// a burst of identical, unsolicited DMs (e.g. announcing a tournament to every
// entrant) is exactly the pattern Discord's abuse detection flags, and it can
// get the whole application (bot + OAuth login) suspended pending review.
export async function sendDiscordDMsSequentially(
  recipients: { discordId: string }[],
  content: string,
  delayMs = 1000,
) {
  for (const { discordId } of recipients) {
    await sendDiscordDM(discordId, content);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
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

// Posts to a public channel via an incoming webhook, not the bot token —
// webhooks need no bot membership or channel permission, just the URL a
// server admin generates under Channel Settings → Integrations → Webhooks,
// which is how a community's own announcements/looking-for-game channel
// gets these without granting the bot broader access than DMs already need.
// Silently no-ops when unconfigured, same reasoning as sendDiscordDM: this
// is a growth nice-to-have, never something the calling flow depends on.
export async function sendDiscordWebhookMessage(webhookUrl: string, content: string) {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 1900) }),
    });
  } catch {
    // Best-effort, same reasoning as sendDiscordDM.
  }
}
