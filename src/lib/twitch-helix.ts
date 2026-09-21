const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const STREAMS_URL = "https://api.twitch.tv/helix/streams";

// Dev-only showcase switch: when MOCK_LIVE_TWITCH=1 (see .env.development),
// every queried channel counts as live without calling Twitch's API. Lets the
// "Live on Twitch" row, the sets feed carousel, and profile embeds be
// developed/demoed against seeded users instead of needing real live
// channels. Never set in production.
const mockLiveTwitch = process.env.MOCK_LIVE_TWITCH === "1";

// App access token (client-credentials grant) — no user involved, distinct
// from the OAuth user-token flow in twitch-oauth.ts. Only used to call
// Helix's /streams "is this channel live" check.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAppAccessToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) return null;

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;

  // Cached in-process — a fast path only when the same Fluid Compute
  // instance handles the next call; a cold instance just fetches a fresh
  // one, same as every other request here failing closed on error.
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000,
  };
  return cachedToken.token;
}

// Fails closed (false) on missing config or any API error — a stream embed
// silently not showing up is far better than erroring out a profile page.
export async function isTwitchLive(username: string): Promise<boolean> {
  const clientId = process.env.TWITCH_OAUTH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return mockLiveTwitch;

  if (mockLiveTwitch) return true;

  try {
    const token = await getAppAccessToken(clientId, clientSecret);
    if (!token) return false;

    const res = await fetch(`${STREAMS_URL}?user_login=${encodeURIComponent(username)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId,
      },
      cache: "no-store",
    });
    if (!res.ok) return false;

    const json = (await res.json()) as { data?: unknown[] };
    return (json.data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// Helix caps /streams at 100 user_login params per request. Batched version
// of isTwitchLive above, for checking many usernames (e.g. a match feed) in
// one or two round trips instead of one call per player — same fail-closed
// behavior, just per-batch so one bad chunk doesn't blank out the rest.
const STREAMS_BATCH_SIZE = 100;

export async function getLiveTwitchUsernames(usernames: string[]): Promise<Set<string>> {
  const clientId = process.env.TWITCH_OAUTH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_OAUTH_CLIENT_SECRET;
  const unique = [...new Set(usernames.map((u) => u.toLowerCase()))];
  if (mockLiveTwitch) return new Set(unique);
  if (!clientId || !clientSecret || unique.length === 0) return new Set();

  const token = await getAppAccessToken(clientId, clientSecret);
  if (!token) return new Set();

  const live = new Set<string>();
  for (let i = 0; i < unique.length; i += STREAMS_BATCH_SIZE) {
    const batch = unique.slice(i, i + STREAMS_BATCH_SIZE);
    const params = new URLSearchParams();
    for (const username of batch) params.append("user_login", username);

    try {
      const res = await fetch(`${STREAMS_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId },
        cache: "no-store",
      });
      if (!res.ok) continue;

      const json = (await res.json()) as { data?: { user_login?: string }[] };
      for (const stream of json.data ?? []) {
        if (stream.user_login) live.add(stream.user_login.toLowerCase());
      }
    } catch {
      // Fail closed for this batch only — other batches still get a chance.
    }
  }
  return live;
}
