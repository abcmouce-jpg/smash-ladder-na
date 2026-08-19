import { LineChart } from "lucide-react";
import { auth } from "@/auth";
import {
  getActiveUserSnapshot,
  getCancelsPerDay,
  getDisputesPerDay,
  getRatingGapChurnAnalysis,
  getReferralRetentionComparison,
  getSignupsPerDay,
  getWeeklyRetentionCohorts,
} from "@/lib/admin-analytics";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TimeSeriesChart } from "@/components/admin/time-series-chart";

function pct(numerator: number, denominator: number) {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export default async function AdminAnalyticsPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user?.id || (role !== "MOD" && role !== "ADMIN")) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-2 text-sm text-muted-foreground">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const [signups, cancels, disputes, activeSnapshot, cohorts, referralRetention, ratingGapChurn] = await Promise.all([
    getSignupsPerDay(),
    getCancelsPerDay(),
    getDisputesPerDay(),
    getActiveUserSnapshot(),
    getWeeklyRetentionCohorts(8),
    getReferralRetentionComparison(),
    getRatingGapChurnAnalysis(),
  ]);

  // "Determined" excludes still-pending signups (their own 7-day window
  // hasn't closed yet) from the rate's denominator — otherwise someone who
  // signed up 2 days ago with no 2nd match yet reads as "not retained"
  // instead of "not decided yet", understating the rate for any in-progress
  // week. See retentionByCohort's own comment in admin-analytics.ts.
  const totalRetained = cohorts.reduce((n, c) => n + c.retained, 0);
  const totalDetermined = cohorts.reduce((n, c) => n + c.cohortSize - c.stillPending, 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center gap-2">
        <LineChart className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Trends and retention data to inform site direction — not a live dashboard, refreshes on visit.
      </p>

      {/* Currently-active snapshot */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <Card className="py-0">
          <CardContent className="py-4 text-center">
            <p className="text-xl font-semibold tabular-nums">{activeSnapshot.last24h}</p>
            <p className="mt-1 text-xs text-muted-foreground">Active (24h)</p>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="py-4 text-center">
            <p className="text-xl font-semibold tabular-nums">{activeSnapshot.last7d}</p>
            <p className="mt-1 text-xs text-muted-foreground">Active (7d)</p>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="py-4 text-center">
            <p className="text-xl font-semibold tabular-nums">{activeSnapshot.last30d}</p>
            <p className="mt-1 text-xs text-muted-foreground">Active (30d)</p>
          </CardContent>
        </Card>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Point-in-time only — lastSignInAt holds just the most recent sign-in per user, so these can&apos;t be charted
        historically without new daily tracking. Ask if that&apos;s worth adding.
      </p>

      {/* Trend charts */}
      <Card className="mt-6">
        <CardHeader>
          <p className="text-sm font-medium">New signups</p>
        </CardHeader>
        <CardContent>
          <TimeSeriesChart timestamps={signups} label="Signups" emptyMessage="No signups in the last 90 days." />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <p className="text-sm font-medium">Free cancels</p>
        </CardHeader>
        <CardContent>
          <TimeSeriesChart
            timestamps={cancels}
            label="Cancels"
            color="oklch(0.65 0.19 40)"
            emptyMessage="No cancelled matches in the last 90 days."
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <p className="text-sm font-medium">Disputes escalated to mods</p>
        </CardHeader>
        <CardContent>
          <TimeSeriesChart
            timestamps={disputes}
            label="Disputes"
            color="oklch(0.6 0.22 25)"
            emptyMessage="No disputes in the last 90 days."
          />
        </CardContent>
      </Card>

      {/* Retention */}
      <Card className="mt-8">
        <CardHeader>
          <p className="text-sm font-medium">New-player retention</p>
          <p className="text-xs text-muted-foreground">
            % of new signups who played a 2nd match within 7 days, by signup week.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              Overall: {pct(totalRetained, totalDetermined)} ({totalRetained}/{totalDetermined} decided)
            </Badge>
          </div>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-1.5 font-medium">Signup week</th>
                <th className="py-1.5 text-right font-medium tabular-nums">Cohort size</th>
                <th className="py-1.5 text-right font-medium tabular-nums">Retained (7d, 2nd match)</th>
              </tr>
            </thead>
            <tbody>
              {[...cohorts].reverse().map((c) => {
                const determined = c.cohortSize - c.stillPending;
                return (
                  <tr key={c.weekStart} className="border-b border-border/60 last:border-0">
                    <td className="py-1.5">
                      {new Date(c.weekStart).toLocaleDateString("en-US", { dateStyle: "medium" })}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{c.cohortSize}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {determined === 0 ? (
                        <span className="text-muted-foreground">{c.retained} so far — too early to tell</span>
                      ) : (
                        <>
                          {c.retained} ({pct(c.retained, determined)})
                          {c.stillPending > 0 && (
                            <span className="text-muted-foreground"> · {c.stillPending} still pending</span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {cohorts.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-3 text-center text-muted-foreground">
                    No signups in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Referral retention comparison */}
      <Card className="mt-4">
        <CardHeader>
          <p className="text-sm font-medium">Referred vs. organic retention</p>
          <p className="text-xs text-muted-foreground">Last 12 signup weeks, same 7-day/2nd-match definition.</p>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1 rounded-lg border border-border p-3 text-center">
            <p className="text-lg font-semibold tabular-nums">
              {pct(
                referralRetention.referred.retained,
                referralRetention.referred.cohortSize - referralRetention.referred.stillPending,
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Referred ({referralRetention.referred.retained}/
              {referralRetention.referred.cohortSize - referralRetention.referred.stillPending} decided)
            </p>
          </div>
          <div className="flex-1 rounded-lg border border-border p-3 text-center">
            <p className="text-lg font-semibold tabular-nums">
              {pct(
                referralRetention.organic.retained,
                referralRetention.organic.cohortSize - referralRetention.organic.stillPending,
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Organic ({referralRetention.organic.retained}/
              {referralRetention.organic.cohortSize - referralRetention.organic.stillPending} decided)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Rating-gap churn */}
      <Card className="mt-4">
        <CardHeader>
          <p className="text-sm font-medium">Early rating-gap stomps vs. churn</p>
          <p className="text-xs text-muted-foreground">
            Among players with ≥1 match: did facing a 200+ rated opponent in their first 3 matches correlate with no
            sign-in in the last 30 days?
          </p>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1 rounded-lg border border-border p-3 text-center">
            <p className="text-lg font-semibold tabular-nums">
              {pct(ratingGapChurn.facedBigGap.churned, ratingGapChurn.facedBigGap.cohortSize)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Faced a 200+ gap ({ratingGapChurn.facedBigGap.churned}/{ratingGapChurn.facedBigGap.cohortSize} churned)
            </p>
          </div>
          <div className="flex-1 rounded-lg border border-border p-3 text-center">
            <p className="text-lg font-semibold tabular-nums">
              {pct(ratingGapChurn.noBigGap.churned, ratingGapChurn.noBigGap.cohortSize)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Didn&apos;t ({ratingGapChurn.noBigGap.churned}/{ratingGapChurn.noBigGap.cohortSize} churned)
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
