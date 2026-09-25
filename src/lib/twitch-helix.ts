const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const STREAMS_URL = "https://api.twitch.tv/helix/streams";

// Dev-only showcase switch: when MOCK_LIVE_TWITCH=1 (see .env.development),
// every queried channel counts as live without calling Twitch's API. Lets the
// home page carousel, the Live page's pinned player, and the profile embeds be
// developed/demoed against seeded users instead of needing real live channels.
//
// Production ignores the flag outright. It's meant for .env.development only,
// but .env is loaded in every environment — so gating on NODE_ENV here is what
// stops a stray/leftover MOCK_LIVE_TWITCH from making a deployed site advertise
// offline channels as live on every page (see .env.example).
const mockLiveTwitch = process.env.NODE_ENV !== "production" && process.env.MOCK_LIVE_TWITCH === "1";

// App access token (client-credentials grant) — no user involved, distinct
// from the OAuth user-token flow in twitch-oauth.ts. Only used to call
// Helix's /streams "is this channel live" check.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAppAccessToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  try {
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
  } catch {
    // A network/DNS blip talking to Twitch must fail closed like any other
    // API error, not throw out of a live check and 500 the whole render.
    return null;
  }
}

// Helix caps /streams at 100 user_login params per request.
const STREAMS_BATCH_SIZE = 100;

// A channel's live status only changes on the order of minutes, but the Live
// page re-checks the feed on every 20s poll (see sets-feed-poller.tsx) and the
// home/profile pages re-check on every render — all against one shared
// per-client-ID rate limit. Memoizing each answer briefly turns those repeats
// into free hits. Only successful lookups are stored, so an error is retried
// on the next call instead of being cached as "offline".
const LIVE_STATUS_TTL_MS = 30_000;
const liveStatusCache = new Map<string, { live: boolean; expiresAt: number }>();

function readLiveStatus(login: string): boolean | null {
  const cached = liveStatusCache.get(login);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    liveStatusCache.delete(login);
    return null;
  }
  return cached.live;
}

function rememberLiveStatus(login: string, live: boolean) {
  liveStatusCache.set(login, { live, expiresAt: Date.now() + LIVE_STATUS_TTL_MS });
}

// Returns the subset of `logins` that are live, or null if the lookup failed
// (network error, rate limit, unexpected status) — callers decide how to fail
// closed. One request for the whole batch, retried once: Twitch hands out an
// app access token per request and only keeps the ~25 most recent per client
// ID, so minting a new one silently invalidates the oldest. Every serverless
// cold start mints its own, which means a long-lived instance's cached token
// can be pushed out from under it and start 401ing every call (see
// https://discuss.dev.twitch.com/t/limit-on-access-tokens/26651). Failing
// closed on that blanked out every live stream site-wide until the process
// happened to recycle, so a 401/403 drops the cached token and retries once
// with a freshly minted one.
async function queryLiveLogins(logins: string[], clientId: string, clientSecret: string): Promise<Set<string> | null> {
  const params = new URLSearchParams({ first: String(STREAMS_BATCH_SIZE) });
  for (const login of logins) params.append("user_login", login);
  const url = `${STREAMS_URL}?${params.toString()}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAppAccessToken(clientId, clientSecret);
    if (!token) return null;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId },
        cache: "no-store",
      });
    } catch {
      return null;
    }

    if ((res.status === 401 || res.status === 403) && attempt === 0) {
      cachedToken = null;
      continue;
    }
    if (!res.ok) return null;

    try {
      const json = (await res.json()) as { data?: { user_login?: string }[] };
      const live = new Set<string>();
      for (const stream of json.data ?? []) {
        if (stream.user_login) live.add(stream.user_login.toLowerCase());
      }
      return live;
    } catch {
      return null;
    }
  }

  return null;
}

// Fails closed (false) on missing config or any API error — a stream embed
// silently not showing up is far better than erroring out a profile page.
export async function isTwitchLive(username: string): Promise<boolean> {
  const clientId = process.env.TWITCH_OAUTH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return mockLiveTwitch;

  if (mockLiveTwitch) return true;

  const login = username.toLowerCase();
  const cached = readLiveStatus(login);
  if (cached !== null) return cached;

  const live = await queryLiveLogins([login], clientId, clientSecret);
  if (live === null) return false;

  const isLive = live.has(login);
  rememberLiveStatus(login, isLive);
  return isLive;
}

// Batched version of isTwitchLive above, for checking many usernames (e.g. a
// match feed) in one or two round trips instead of one call per player — same
// fail-closed behavior, just per-batch so one bad chunk doesn't blank out the
// rest.
export async function getLiveTwitchUsernames(usernames: string[]): Promise<Set<string>> {
  const clientId = process.env.TWITCH_OAUTH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_OAUTH_CLIENT_SECRET;
  const unique = [...new Set(usernames.map((u) => u.toLowerCase()))];
  if (mockLiveTwitch) return new Set(unique);
  if (!clientId || !clientSecret || unique.length === 0) return new Set();

  const live = new Set<string>();
  const uncached: string[] = [];
  for (const login of unique) {
    const cached = readLiveStatus(login);
    if (cached === null) uncached.push(login);
    else if (cached) live.add(login);
  }

  for (let i = 0; i < uncached.length; i += STREAMS_BATCH_SIZE) {
    const batch = uncached.slice(i, i + STREAMS_BATCH_SIZE);
    const result = await queryLiveLogins(batch, clientId, clientSecret);
    // Fail closed for this batch only — the result is left uncached, so the
    // next poll retries it and other batches still get a chance.
    if (!result) continue;

    for (const login of batch) {
      const isLive = result.has(login);
      rememberLiveStatus(login, isLive);
      if (isLive) live.add(login);
    }
  }

  return live;
}
