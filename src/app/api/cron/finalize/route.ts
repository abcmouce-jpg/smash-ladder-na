import { NextResponse } from "next/server";
import { finalizeExpiredFreeBattlePosts, finalizeExpiredLobbyEntries, finalizeExpiredMatches } from "@/lib/finalize";
import { sweepLobbyPairing } from "@/lib/lobby";
import { autoSuspendWatchlistViolators } from "@/lib/admin-watchlist";
import { endActiveSeasonIfDue } from "@/lib/seasons";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Runs first: a season with a scheduledEndAt (see the admin Seasons page)
  // rolls over the moment it passes, cancelling any still-open match as part
  // of the same transaction before anything below gets a chance to touch it.
  // A season with no scheduledEndAt is untouched — still fully manual.
  const seasonRolledOver = await endActiveSeasonIfDue();

  // Pair off anyone still waiting before considering expiry, so a burst of
  // joins that missed each other at request time gets a second chance.
  const sweepPaired = await sweepLobbyPairing();
  const expiredLobbyEntries = await finalizeExpiredLobbyEntries();
  const { expiredNoReport, autoConfirmed, closedOutOnLead } = await finalizeExpiredMatches();
  const expiredFreeBattlePosts = await finalizeExpiredFreeBattlePosts();
  // Re-checks the same cancel-abuse thresholds cancelMatch enforces live,
  // catching anyone whose auto-suspend already lapsed and who's sat ACTIVE
  // since — see autoSuspendWatchlistViolators' comment.
  const patrolSuspended = await autoSuspendWatchlistViolators();

  return NextResponse.json({
    seasonRolledOver,
    sweepPaired,
    expiredLobbyEntries,
    expiredNoReport,
    autoConfirmed,
    closedOutOnLead,
    expiredFreeBattlePosts,
    patrolSuspended,
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
