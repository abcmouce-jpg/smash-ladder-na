import { NextResponse } from "next/server";
import { CHARACTER_TIMEOUT_MS, REPORT_TIMEOUT_MS, STRIKE_TIMEOUT_MS } from "@/lib/match-games";

// Diagnostic-only: lets us confirm what's actually executing in production
// right now, rather than trusting that a deploy/alias switch took effect —
// this project has no Git integration (`vercel project ls` shows link: null),
// which has already caused Cron Jobs registration to not sync from vercel.json
// on a plain `vercel deploy --prod`, and character-pick forfeits kept firing
// at the old ~60s cadence for several minutes after a deploy that raised
// CHARACTER_TIMEOUT_MS to 3 minutes. Same CRON_SECRET gate as /api/cron/finalize
// since this exposes internal config, not because it does anything sensitive.
function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    now: new Date().toISOString(),
    characterTimeoutMs: CHARACTER_TIMEOUT_MS,
    strikeTimeoutMs: STRIKE_TIMEOUT_MS,
    reportTimeoutMs: REPORT_TIMEOUT_MS,
    vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
    vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    region: process.env.VERCEL_REGION ?? null,
  });
}
