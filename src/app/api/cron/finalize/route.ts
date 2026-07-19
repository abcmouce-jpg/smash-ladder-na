import { NextResponse } from "next/server";
import { finalizeExpiredLobbyEntries, finalizeExpiredMatches } from "@/lib/finalize";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expiredLobbyEntries = await finalizeExpiredLobbyEntries();
  const { expiredNoReport, autoConfirmed } = await finalizeExpiredMatches();

  return NextResponse.json({ expiredLobbyEntries, expiredNoReport, autoConfirmed });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
