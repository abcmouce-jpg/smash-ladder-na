import Link from "next/link";
import { Flag } from "lucide-react";
import { auth } from "@/auth";
import { listOpenReports } from "@/lib/reports";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { banReportedUser, dismiss, reinstateUser, suspendReportedUser } from "./actions";

const SUSPENSION_DURATION_OPTIONS = [
  { label: "1 day", value: "24" },
  { label: "3 days", value: "72" },
  { label: "7 days", value: "168" },
  { label: "30 days", value: "720" },
  { label: "Indefinite", value: "indefinite" },
] as const;

// Coarse "how old" at a glance — mods triaging a list of reports care about
// roughly how stale something is, not the precise minute, so this doesn't
// need to be a live-updating client component (the exact timestamp is still
// available via the title attribute on hover).
function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function ReportsPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user?.id || (role !== "MOD" && role !== "ADMIN")) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have access to this page.
        </p>
      </main>
    );
  }

  const reports = await listOpenReports();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Flag className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
      </div>

      {reports.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No open reports.</p>
      )}

      <ul className="mt-6 flex flex-col gap-4">
        {reports.map((report) => {
          const totalReports = report.reportedUser._count.reportsReceived;
          const totalBlocks = report.reportedUser._count.blocksReceived;
          const isActive = report.reportedUser.status === "ACTIVE";

          return (
            <li key={report.id}>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      <Link href={`/players/${report.reportedUser.id}`} className="hover:underline">
                        {report.reportedUser.username}
                      </Link>{" "}
                      reported by{" "}
                      <Link href={`/players/${report.reporter.id}`} className="hover:underline">
                        {report.reporter.username}
                      </Link>
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" title={report.createdAt.toLocaleString()}>
                        {timeAgo(report.createdAt)}
                      </Badge>
                      <Badge variant="outline" className="tabular-nums">
                        {totalReports} report{totalReports === 1 ? "" : "s"} total
                      </Badge>
                      {totalBlocks > 0 && (
                        <Badge variant="outline" className="tabular-nums">
                          blocked by {totalBlocks}
                        </Badge>
                      )}
                      <Badge variant="outline">{report.reportedUser.status.toLowerCase()}</Badge>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{report.reason}</p>
                  {report.match && (
                    <p className="mt-1 text-xs text-muted-foreground">Match: {report.match.id}</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <form action={dismiss.bind(null, report.id)}>
                      <Button type="submit" variant="outline" size="sm">
                        Dismiss
                      </Button>
                    </form>

                    <form action={suspendReportedUser.bind(null, report.id)} className="flex items-center gap-1.5">
                      <select
                        name="suspensionHours"
                        defaultValue="indefinite"
                        className="h-7 rounded-lg border border-border bg-background px-1.5 text-xs text-foreground outline-none focus-visible:border-ring"
                      >
                        {SUSPENSION_DURATION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" variant="secondary" size="sm">
                        Suspend
                      </Button>
                    </form>

                    <form action={banReportedUser.bind(null, report.id)}>
                      <Button type="submit" variant="destructive" size="sm">
                        Ban
                      </Button>
                    </form>

                    {!isActive && (
                      <form action={reinstateUser.bind(null, report.reportedUser.id)}>
                        <Button type="submit" variant="outline" size="sm">
                          Reinstate
                        </Button>
                      </form>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
