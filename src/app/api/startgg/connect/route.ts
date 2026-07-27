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

  const response = NextResponse.redirect(buildStartggAuthorizeUrl(redirectUri, state));
  response.cookies.set(STARTGG_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
