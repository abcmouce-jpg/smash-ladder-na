import { NextResponse } from "next/server";
import {
  finalizeExpiredFreeBattlePosts,
  finalizeExpiredLobbyEntries,
  finalizeExpiredMatches,
} from "@/lib/finalize";
import { sweepLobbyPairing } from "@/lib/lobby";
import { launchPreSeasonIfDue } from "@/lib/seasons";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const preSeasonLaunched = await launchPreSeasonIfDue();

  // Pair off anyone still waiting before considering expiry, so a burst of
  // joins that missed each other at request time gets a second chance.
  const sweepPaired = await sweepLobbyPairing();
  const expiredLobbyEntries = await finalizeExpiredLobbyEntries();
  const { expiredNoReport, autoConfirmed } = await finalizeExpiredMatches();
  const expiredFreeBattlePosts = await finalizeExpiredFreeBattlePosts();

  return NextResponse.json({
    preSeasonLaunched,
    sweepPaired,
    expiredLobbyEntries,
    expiredNoReport,
    autoConfirmed,
    expiredFreeBattlePosts,
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
