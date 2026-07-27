import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildTwitchAuthorizeUrl, TWITCH_STATE_COOKIE } from "@/lib/twitch-oauth";

// Kicks off the "connect your Twitch account" flow from Settings — not a
// sign-in provider, just linking a verified identity onto the ladder
// account the player is already signed into via Discord.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/settings", request.url));
  }

  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/twitch/callback", request.url).toString();

  let authorizeUrl: string;
  try {
    authorizeUrl = buildTwitchAuthorizeUrl(redirectUri, state);
  } catch (err) {
    const url = new URL("/settings", request.url);
    url.searchParams.set(
      "twitchError",
      err instanceof Error ? err.message : "Twitch connections aren't available right now.",
    );
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(TWITCH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
