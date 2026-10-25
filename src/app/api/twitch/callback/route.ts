import { NextResponse, type NextRequest } from "next/server";
import { errorMessage } from "@/lib/localized-error";
import { getLang } from "@/lib/i18n";
import { tr } from "@/lib/lang";
import { auth } from "@/auth";
import { connectTwitchAccount, TWITCH_STATE_COOKIE } from "@/lib/twitch-oauth";

function redirectWithError(request: Request, message: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("twitchError", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/settings", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get(TWITCH_STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectWithError(
      request,
      tr(await getLang(), {
        en: "That connection request expired or was invalid — try again.",
        es: "Esa solicitud de conexión expiró o no era válida — inténtalo de nuevo.",
        ja: "連携のリクエストが期限切れか無効でした。もう一度お試しください。",
      }),
    );
  }

  const redirectUri = new URL("/api/twitch/callback", request.url).toString();

  try {
    await connectTwitchAccount(session.user.id, code, redirectUri);
  } catch (err) {
    return redirectWithError(request, errorMessage(err, await getLang()));
  }

  const response = NextResponse.redirect(new URL("/settings?twitchConnected=1", request.url));
  response.cookies.delete(TWITCH_STATE_COOKIE);
  return response;
}
