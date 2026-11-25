import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { LocalizedError } from "@/lib/localized-error";

// Google OAuth + YouTube Data API, for linking a player's own YouTube channel
// and asking whether it is broadcasting right now.
//
// The liveness question is the whole reason this exists. YouTube's search.list
// costs 100 quota units per call against a default 10,000/day allowance, so a
// feed-wide poll can't use it. liveBroadcasts.list with mine=true runs on the
// player's own OAuth token at 1 unit, which makes a linked channel as cheap to
// check as a Twitch one gets from Helix.

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";
const LIVE_BROADCASTS_URL = "https://www.googleapis.com/youtube/v3/liveBroadcasts";

// Read-only access to the authenticated channel is all that's needed to look up
// its live broadcasts. Nothing here writes to the player's YouTube account.
export const YOUTUBE_OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

// Short-lived cookie carrying the CSRF state token between
// /api/youtube/connect (sets it) and /api/youtube/callback (verifies it matches
// what Google echoes back).
export const YOUTUBE_STATE_COOKIE = "youtube_oauth_state";

export function isYouTubeConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function requireClientCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new LocalizedError({
      en: "YouTube linking isn't configured on this deployment",
      es: "La vinculación con YouTube no está configurada en este despliegue",
    });
  }
  return { clientId, clientSecret };
}

export function buildYouTubeAuthorizeUrl(redirectUri: string, state: string): string {
  const { clientId } = requireClientCredentials();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: YOUTUBE_OAUTH_SCOPE,
    state,
    // access_type=offline + prompt=consent is what makes Google hand back a
    // refresh token. Without it the access token expires after an hour and the
    // channel can no longer be checked while the player is offline on this site.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new LocalizedError({
      en: "Google rejected the authorization request",
      es: "Google rechazó la solicitud de autorización",
    });
  }
  return (await res.json()) as TokenResponse;
}

async function exchangeCodeForToken(code: string, redirectUri: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = requireClientCredentials();
  const tokens = await postToken({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });
  if (!tokens.access_token) {
    throw new LocalizedError({
      en: "Google didn't return an access token",
      es: "Google no devolvió un token de acceso",
    });
  }
  return tokens;
}

export interface YouTubeIdentity {
  channelId: string;
  channelTitle: string;
  profileImageUrl: string | null;
}

async function fetchCurrentYouTubeChannel(accessToken: string): Promise<YouTubeIdentity> {
  const res = await fetch(`${CHANNELS_URL}?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new LocalizedError({
      en: "Couldn't reach YouTube's API",
      es: "No se pudo contactar la API de YouTube",
    });
  }

  const json = (await res.json()) as {
    items?: Array<{
      id?: string;
      snippet?: { title?: string; thumbnails?: { default?: { url?: string }; high?: { url?: string } } };
    }>;
  };
  const channel = json.items?.[0];
  if (!channel?.id) {
    throw new LocalizedError({
      en: "That Google account doesn't have a YouTube channel",
      es: "Esa cuenta de Google no tiene un canal de YouTube",
    });
  }

  return {
    channelId: channel.id,
    channelTitle: channel.snippet?.title ?? channel.id,
    profileImageUrl: channel.snippet?.thumbnails?.high?.url ?? channel.snippet?.thumbnails?.default?.url ?? null,
  };
}

// The identity comes from Google/YouTube itself via OAuth, so it can't be faked
// — the same reasoning as the Twitch and start.gg connect flows.
export async function connectYouTubeAccount(userId: string, code: string, redirectUri: string) {
  const tokens = await exchangeCodeForToken(code, redirectUri);
  const channel = await fetchCurrentYouTubeChannel(tokens.access_token as string);

  if (!tokens.refresh_token) {
    // With prompt=consent this shouldn't happen, but a missing refresh token
    // means we could only check liveness for the next hour. Refuse rather than
    // half-link the account.
    throw new LocalizedError({
      en: "Google didn't grant offline access — try connecting again",
      es: "Google no concedió acceso sin conexión — inténtalo de nuevo",
    });
  }

  const claimedByOther = await prisma.user.findUnique({ where: { youtubeUserId: channel.channelId } });
  if (claimedByOther && claimedByOther.id !== userId) {
    throw new LocalizedError({
      en: "That YouTube channel is already linked to a different ladder account",
      es: "Ese canal de YouTube ya está vinculado a otra cuenta",
    });
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        youtubeUserId: channel.channelId,
        youtubeChannelTitle: channel.channelTitle,
        youtubeProfileImageUrl: channel.profileImageUrl,
        youtubeConnectedAt: new Date(),
        youtubeRefreshToken: tokens.refresh_token,
        youtubeAccessToken: tokens.access_token,
        youtubeAccessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new LocalizedError({
        en: "That YouTube channel is already linked to a different ladder account",
        es: "Ese canal de YouTube ya está vinculado a otra cuenta",
      });
    }
    throw err;
  }
}

export async function disconnectYouTubeAccount(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      youtubeUserId: null,
      youtubeChannelTitle: null,
      youtubeProfileImageUrl: null,
      youtubeConnectedAt: null,
      youtubeRefreshToken: null,
      youtubeAccessToken: null,
      youtubeAccessTokenExpiresAt: null,
    },
  });
}

// A broadcast the channel is running right now, reduced to what the feed and
// replay UI need.
export interface YouTubeLiveStream {
  videoId: string;
  channelId: string;
  title: string;
  startedAt: Date;
}

// Twenty seconds of memoization, matching the Twitch live-status cache: the
// Live page re-checks its feed every 20s and every page render asks again, so
// without this each viewer would mint one quota-costing call per poll.
const LIVE_STATUS_TTL_MS = 30_000;
const liveStatusCache = new Map<string, { stream: YouTubeLiveStream | null; expiresAt: number }>();

function readCache(channelId: string): YouTubeLiveStream | null | undefined {
  const cached = liveStatusCache.get(channelId);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    liveStatusCache.delete(channelId);
    return undefined;
  }
  return cached.stream;
}

function rememberCache(channelId: string, stream: YouTubeLiveStream | null) {
  liveStatusCache.set(channelId, { stream, expiresAt: Date.now() + LIVE_STATUS_TTL_MS });
}

type StoredTokens = {
  youtubeUserId: string | null;
  youtubeChannelTitle: string | null;
  youtubeAccessToken: string | null;
  youtubeAccessTokenExpiresAt: Date | null;
  youtubeRefreshToken: string | null;
};

// Returns a usable access token for this channel, refreshing and persisting it
// when the cached one has expired. Fails closed (null) on any error — liveness
// is a nice-to-have and must never take down a page render.
async function getAccessToken(user: StoredTokens): Promise<string | null> {
  if (user.youtubeAccessToken && user.youtubeAccessTokenExpiresAt) {
    if (user.youtubeAccessTokenExpiresAt.getTime() > Date.now() + 60_000) return user.youtubeAccessToken;
  }
  if (!user.youtubeRefreshToken) return null;

  try {
    const { clientId, clientSecret } = requireClientCredentials();
    const tokens = await postToken({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: user.youtubeRefreshToken,
    });
    if (!tokens.access_token) return null;

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
    if (user.youtubeUserId) {
      await prisma.user.update({
        where: { youtubeUserId: user.youtubeUserId },
        data: { youtubeAccessToken: tokens.access_token, youtubeAccessTokenExpiresAt: expiresAt },
      });
    }
    return tokens.access_token;
  } catch {
    return null;
  }
}

async function fetchLiveBroadcast(
  accessToken: string,
  channelId: string,
  fallbackTitle: string | null,
): Promise<YouTubeLiveStream | null> {
  const params = new URLSearchParams({
    part: "snippet,status",
    mine: "true",
    broadcastStatus: "active",
    broadcastType: "all",
    maxResults: "5",
  });

  let res: Response;
  try {
    res = await fetch(`${LIVE_BROADCASTS_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const json = (await res.json()) as {
    items?: Array<{
      id?: string;
      snippet?: {
        title?: string;
        actualStartTime?: string;
        scheduledStartTime?: string;
        channelId?: string;
        channelTitle?: string;
      };
      status?: { lifeCycleStatus?: string };
    }>;
  };

  for (const item of json.items ?? []) {
    if (!item.id) continue;
    // broadcastStatus=active already narrows this down; the explicit
    // lifeCycleStatus check keeps a "ready" (not yet live) broadcast out.
    if (item.status?.lifeCycleStatus && item.status.lifeCycleStatus !== "live") continue;

    const start = item.snippet?.actualStartTime ?? item.snippet?.scheduledStartTime;
    return {
      videoId: item.id,
      channelId: item.snippet?.channelId ?? channelId,
      title: item.snippet?.title ?? fallbackTitle ?? channelId,
      startedAt: start ? new Date(start) : new Date(),
    };
  }

  return null;
}

/**
 * Which of these ladder users are live on YouTube right now.
 *
 * Keyed by ladder user id. One liveBroadcasts call per connected player whose
 * answer isn't already cached; players with no YouTube connection cost nothing.
 * Failures leave that player out of the map (fail closed) rather than throwing.
 */
export async function getLiveYouTubeStreams(userIds: string[]): Promise<Map<string, YouTubeLiveStream>> {
  const result = new Map<string, YouTubeLiveStream>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0 || !isYouTubeConfigured()) return result;

  let users: (StoredTokens & { id: string })[];
  try {
    users = await prisma.user.findMany({
      where: { id: { in: unique }, youtubeUserId: { not: null }, youtubeRefreshToken: { not: null } },
      select: {
        id: true,
        youtubeUserId: true,
        youtubeChannelTitle: true,
        youtubeAccessToken: true,
        youtubeAccessTokenExpiresAt: true,
        youtubeRefreshToken: true,
      },
    });
  } catch {
    return result;
  }

  for (const user of users) {
    const channelId = user.youtubeUserId;
    if (!channelId) continue;

    const cached = readCache(channelId);
    if (cached !== undefined) {
      if (cached) result.set(user.id, cached);
      continue;
    }

    const token = await getAccessToken(user);
    if (!token) {
      // A revoked/expired refresh token (or a transient Google failure) would
      // otherwise retry on every render. Fail closed for the same short window
      // as a real answer; a resolved grant starts working again afterwards.
      rememberCache(channelId, null);
      continue;
    }

    const stream = await fetchLiveBroadcast(token, channelId, user.youtubeChannelTitle);
    rememberCache(channelId, stream);
    if (stream) result.set(user.id, stream);
  }

  return result;
}
