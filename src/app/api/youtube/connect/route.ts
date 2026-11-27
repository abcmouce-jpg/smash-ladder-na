import { NextResponse } from "next/server";
import { errorMessage } from "@/lib/localized-error";
import { getLang } from "@/lib/i18n";
import { auth } from "@/auth";
import { buildYouTubeAuthorizeUrl, YOUTUBE_STATE_COOKIE } from "@/lib/youtube-oauth";

// Kicks off the "connect your YouTube channel" flow from Settings — not a
// sign-in provider, just linking a verified identity onto the ladder account
// the player is already signed in with via Discord.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/settings", request.url));
  }

  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/youtube/callback", request.url).toString();

  let authorizeUrl: string;
  try {
    authorizeUrl = buildYouTubeAuthorizeUrl(redirectUri, state);
  } catch (err) {
    const url = new URL("/settings", request.url);
    url.searchParams.set("youtubeError", errorMessage(err, await getLang()));
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(YOUTUBE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
