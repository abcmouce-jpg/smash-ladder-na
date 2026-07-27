import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

// https://dev.twitch.tv/docs/authentication/getting-started-with-oauth/
const AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const USERS_URL = "https://api.twitch.tv/helix/users";

// user:read:email is the minimal scope to read the authenticated user's
// basic identity (id, login, display_name, profile_image_url) from Helix.
export const TWITCH_OAUTH_SCOPE = "user:read:email";

// Short-lived cookie carrying the CSRF state token between /api/twitch/connect
// (sets it) and /api/twitch/callback (verifies it matches what Twitch echoes back).
export const TWITCH_STATE_COOKIE = "twitch_oauth_state";

function requireClientCredentials() {
  const clientId = process.env.TWITCH_OAUTH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Twitch OAuth isn't configured on this deployment");
  }
  return { clientId, clientSecret };
}

export function buildTwitchAuthorizeUrl(redirectUri: string, state: string) {
  const { clientId } = requireClientCredentials();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: TWITCH_OAUTH_SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  const { clientId, clientSecret } = requireClientCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error("Twitch rejected the authorization code");

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Twitch didn't return an access token");
  return json.access_token;
}

export interface TwitchIdentity {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string | null;
}

async function fetchCurrentTwitchUser(accessToken: string): Promise<TwitchIdentity> {
  const { clientId } = requireClientCredentials();
  const res = await fetch(USERS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
  });
  if (!res.ok) throw new Error("Couldn't reach Twitch's API");

  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      login: string;
      display_name: string;
      profile_image_url: string;
    }>;
  };
  const user = json.data?.[0];
  if (!user) throw new Error("Twitch didn't return a user");

  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    profileImageUrl: user.profile_image_url || null,
  };
}

// The identity comes from Twitch itself via OAuth, so it can't be faked.
export async function connectTwitchAccount(userId: string, code: string, redirectUri: string) {
  const accessToken = await exchangeCodeForToken(code, redirectUri);
  const identity = await fetchCurrentTwitchUser(accessToken);

  const claimedByOther = await prisma.user.findUnique({ where: { twitchUserId: identity.id } });
  if (claimedByOther && claimedByOther.id !== userId) {
    throw new Error("That Twitch account is already linked to a different ladder account");
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        twitchUserId: identity.id,
        twitchUsername: identity.login,
        twitchDisplayName: identity.displayName,
        twitchProfileImageUrl: identity.profileImageUrl,
        twitchConnectedAt: new Date(),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("That Twitch account is already linked to a different ladder account");
    }
    throw err;
  }
}

export async function disconnectTwitchAccount(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      twitchUserId: null,
      twitchUsername: null,
      twitchDisplayName: null,
      twitchProfileImageUrl: null,
      twitchConnectedAt: null,
    },
  });
}
