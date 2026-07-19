import Link from "next/link";
import {
  Activity,
  Ban,
  Flag,
  Gauge,
  Medal,
  Shield,
  Swords,
  Users,
} from "lucide-react";
import { auth } from "@/auth";
import { getAdminOverview } from "@/lib/admin-stats";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  href?: string;
  tone?: "warning" | "destructive";
}) {
  const inner = (
    <CardContent className="flex items-center gap-3 py-4">
      <Icon
        className={`size-5 ${
          tone === "destructive"
            ? "text-destructive"
            : tone === "warning"
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground"
        }`}
      />
      <div>
        <p className="text-xl font-semibold tabular-nums leading-none">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </CardContent>
  );

  return (
    <Card className="py-0">
      {href ? (
        <Link href={href} className="block hover:bg-accent/50">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </Card>
  );
}

export default async function AdminOverviewPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user?.id || (role !== "MOD" && role !== "ADMIN")) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have access to this page.
        </p>
      </main>
    );
  }

  const stats = await getAdminOverview();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Gauge className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Admin overview</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Live snapshot — refreshes on every visit.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <StatCard icon={Activity} label="Active in last 24h" value={stats.activeUsers24h} />
        <StatCard icon={Users} label="Total players" value={stats.totalUsers} />
        <StatCard icon={Swords} label="Matches today" value={stats.matchesToday} />
        <StatCard icon={Medal} label="Open tournaments" value={stats.openTournaments} />
        <StatCard
          icon={Users}
          label="Lobby waiting / paired"
          value={stats.lobbyWaiting}
          href="/lobby"
        />
        <StatCard
          icon={Shield}
          label="Open disputes"
          value={stats.openDisputes}
          href="/admin/disputes"
          tone={stats.openDisputes > 0 ? "warning" : undefined}
        />
        <StatCard
          icon={Flag}
          label="Open conduct reports"
          value={stats.openReports}
          href="/admin/reports"
          tone={stats.openReports > 0 ? "warning" : undefined}
        />
        <StatCard
          icon={Ban}
          label="Suspended / banned"
          value={stats.suspendedUsers + stats.bannedUsers}
          tone={stats.suspendedUsers + stats.bannedUsers > 0 ? "destructive" : undefined}
        />
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <Badge variant="outline">{stats.lobbyPaired} pairs in progress right now</Badge>
        <Badge variant="outline">{stats.suspendedUsers} suspended</Badge>
        <Badge variant="outline">{stats.bannedUsers} banned</Badge>
      </div>

      <div className="mt-10 flex flex-col gap-2 text-sm">
        <Link href="/admin/disputes" className="text-muted-foreground hover:text-foreground hover:underline">
          Go to Disputes →
        </Link>
        <Link href="/admin/reports" className="text-muted-foreground hover:text-foreground hover:underline">
          Go to Reports →
        </Link>
        <Link href="/admin/seasons" className="text-muted-foreground hover:text-foreground hover:underline">
          Go to Seasons →
        </Link>
      </div>
    </main>
  );
}
