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
export async function sendDiscordDMsSequentially(recipients: { discordId: string }[], content: string, delayMs = 1000) {
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
// `?wait=true` makes Discord return the created message (id included)
// instead of an empty 204 — callers that need to delete it later (see
// deleteDiscordWebhookMessage) can't do that without capturing the id here.
export async function sendDiscordWebhookMessage(webhookUrl: string, content: string): Promise<string | null> {
  try {
    const res = await fetch(`${webhookUrl}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 1900) }),
    });
    if (!res.ok) return null;
    const message = (await res.json()) as { id: string };
    return message.id;
  } catch {
    // Best-effort, same reasoning as sendDiscordDM.
    return null;
  }
}

// Deletes a message this webhook itself posted (see sendDiscordWebhookMessage's
// returned id) — used to take down an announcement once whatever it was
// advertising (e.g. a free battle post) is no longer available. A webhook can
// only delete its own messages, no separate permission needed. Best-effort,
// same reasoning as sendDiscordDM: a message that outlives its post by a few
// minutes is a stale ping, not a broken flow.
export async function deleteDiscordWebhookMessage(webhookUrl: string, messageId: string) {
  try {
    await fetch(`${webhookUrl}/messages/${messageId}`, { method: "DELETE" });
  } catch {
    // Best-effort, same reasoning as sendDiscordDM.
  }
}

// Same as sendDiscordWebhookMessage but with a rich embed (used for tier-up
// announcements, which attach the player's rank card image) — a plain
// content string can't render an image inline the way an embed can.
export async function sendDiscordWebhookEmbed(
  webhookUrl: string,
  content: string,
  embed: { title: string; url?: string; color: number; imageUrl: string },
) {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: content.slice(0, 1900),
        embeds: [
          {
            title: embed.title,
            url: embed.url,
            color: embed.color,
            image: { url: embed.imageUrl },
          },
        ],
      }),
    });
  } catch {
    // Best-effort, same reasoning as sendDiscordDM.
  }
}

// Idempotent: safe to call even if the member already has exactly this
// role, or no role at all to remove. Both requests are fired regardless of
// whether either one 404s (e.g. the member left the server, or never had
// the old role) — best-effort, same reasoning as sendDiscordDM.
export async function syncDiscordGuildMemberRole(
  guildId: string,
  discordId: string,
  addRoleId: string | null,
  removeRoleId: string | null,
) {
  try {
    if (removeRoleId && removeRoleId !== addRoleId) {
      await discordRequest(`/guilds/${guildId}/members/${discordId}/roles/${removeRoleId}`, {
        method: "DELETE",
      });
    }
    if (addRoleId) {
      await discordRequest(`/guilds/${guildId}/members/${discordId}/roles/${addRoleId}`, {
        method: "PUT",
      });
    }
  } catch {
    // Best-effort, same reasoning as sendDiscordDM.
  }
}
