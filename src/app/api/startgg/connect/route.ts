import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildStartggAuthorizeUrl, STARTGG_STATE_COOKIE } from "@/lib/startgg-oauth";

// Kicks off the "connect your start.gg account" flow from Settings — not a
// sign-in provider, just linking a verified identity onto the ladder
// account the player is already signed into via Discord.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/settings", request.url));
  }

  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/startgg/callback", request.url).toString();

  // buildStartggAuthorizeUrl throws if STARTGG_OAUTH_CLIENT_ID/SECRET aren't
  // configured on this deployment — without this catch, that crashed the
  // route handler outright (a blank/broken page) instead of telling the
  // player anything, same failure mode the callback route already guards
  // against below.
  let authorizeUrl: string;
  try {
    authorizeUrl = buildStartggAuthorizeUrl(redirectUri, state);
  } catch (err) {
    const url = new URL("/settings", request.url);
    url.searchParams.set(
      "startggError",
      err instanceof Error ? err.message : "start.gg connections aren't available right now.",
    );
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(STARTGG_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
