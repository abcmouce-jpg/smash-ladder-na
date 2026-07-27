import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { connectStartggAccount, STARTGG_STATE_COOKIE } from "@/lib/startgg-oauth";

function redirectWithError(request: Request, message: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("startggError", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/settings", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get(STARTGG_STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectWithError(request, "That connection request expired or was invalid — try again.");
  }

  const redirectUri = new URL("/api/startgg/callback", request.url).toString();

  try {
    await connectStartggAccount(session.user.id, code, redirectUri);
  } catch (err) {
    return redirectWithError(
      request,
      err instanceof Error ? err.message : "Something went wrong connecting your start.gg account.",
    );
  }

  const response = NextResponse.redirect(new URL("/settings?startggConnected=1", request.url));
  response.cookies.delete(STARTGG_STATE_COOKIE);
  return response;
}
