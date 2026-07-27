import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

// https://developer.start.gg/docs/oauth/oauth-overview
const AUTHORIZE_URL = "https://start.gg/oauth/authorize";
const TOKEN_URL = "https://api.start.gg/oauth/access_token";
const GRAPHQL_URL = "https://api.start.gg/gql/alpha";

// user.identity is the only scope needed to read who the authenticated
// account is (currentUser query) — see developer.start.gg/docs/oauth/scopes.
export const STARTGG_OAUTH_SCOPE = "user.identity";

// Short-lived cookie carrying the CSRF state token between /api/startgg/connect
// (sets it) and /api/startgg/callback (verifies it matches what start.gg echoes back).
export const STARTGG_STATE_COOKIE = "startgg_oauth_state";

function requireClientCredentials() {
  const clientId = process.env.STARTGG_OAUTH_CLIENT_ID;
  const clientSecret = process.env.STARTGG_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("start.gg OAuth isn't configured on this deployment");
  }
  return { clientId, clientSecret };
}

export function buildStartggAuthorizeUrl(redirectUri: string, state: string) {
  const { clientId } = requireClientCredentials();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: STARTGG_OAUTH_SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  const { clientId, clientSecret } = requireClientCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      scope: STARTGG_OAUTH_SCOPE,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error("start.gg rejected the authorization code");

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("start.gg didn't return an access token");
  return json.access_token;
}

export interface StartggIdentity {
  id: string;
  slug: string;
  gamerTag: string | null;
}

async function fetchCurrentStartggUser(accessToken: string): Promise<StartggIdentity> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: "{ currentUser { id slug player { gamerTag } } }" }),
  });
  if (!res.ok) throw new Error("Couldn't reach start.gg's API");

  const json = (await res.json()) as {
    data?: { currentUser: { id: string; slug: string; player: { gamerTag: string | null } | null } | null };
    errors?: unknown;
  };
  if (json.errors || !json.data?.currentUser) throw new Error("start.gg didn't return a user");

  const { id, slug, player } = json.data.currentUser;
  return { id, slug, gamerTag: player?.gamerTag ?? null };
}

// The whole point of OAuth here: the identity comes from start.gg itself,
// not something the player typed in, so it can't be someone else's profile.
export async function connectStartggAccount(userId: string, code: string, redirectUri: string) {
  const accessToken = await exchangeCodeForToken(code, redirectUri);
  const identity = await fetchCurrentStartggUser(accessToken);

  const claimedByOther = await prisma.user.findUnique({ where: { startggUserId: identity.id } });
  if (claimedByOther && claimedByOther.id !== userId) {
    throw new Error("That start.gg account is already linked to a different ladder account");
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        startggUserId: identity.id,
        startggSlug: identity.slug,
        startggGamerTag: identity.gamerTag,
        startggConnectedAt: new Date(),
      },
    });
  } catch (err) {
    // Narrow race window: two ladder accounts finishing this same OAuth
    // flow for the same start.gg account at nearly the same instant would
    // both pass the check above and then collide on the unique constraint.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("That start.gg account is already linked to a different ladder account");
    }
    throw err;
  }
}

export async function disconnectStartggAccount(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { startggUserId: null, startggSlug: null, startggGamerTag: null, startggConnectedAt: null },
  });
}

export function startggProfileUrl(slug: string) {
  return `https://start.gg/${slug}`;
}
