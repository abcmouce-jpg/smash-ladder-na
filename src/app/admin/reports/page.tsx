import Link from "next/link";
import { Flag } from "lucide-react";
import { auth } from "@/auth";
import { listOpenReports } from "@/lib/reports";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { banReportedUser, dismiss, suspendReportedUser } from "./actions";

export default async function ReportsPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user?.id || (role !== "MOD" && role !== "ADMIN")) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have access to this page.
        </p>
      </main>
    );
  }

  const reports = await listOpenReports();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Flag className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
      </div>

      {reports.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No open reports.</p>
      )}

      <ul className="mt-6 flex flex-col gap-4">
        {reports.map((report) => (
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
                  <Badge variant="outline">{report.reportedUser.status.toLowerCase()}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{report.reason}</p>
                {report.match && (
                  <p className="mt-1 text-xs text-muted-foreground">Match: {report.match.id}</p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={dismiss.bind(null, report.id)}>
                    <Button type="submit" variant="outline" size="sm">
                      Dismiss
                    </Button>
                  </form>
                  <form action={suspendReportedUser.bind(null, report.id)}>
                    <Button type="submit" variant="secondary" size="sm">
                      Suspend
                    </Button>
                  </form>
                  <form action={banReportedUser.bind(null, report.id)}>
                    <Button type="submit" variant="destructive" size="sm">
                      Ban
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
