import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { auth } from "@/auth";
import { getSuspendWatchlist, type WatchlistPlayer } from "@/lib/admin-watchlist";
import { CANCEL_SUSPEND_MAX_RATIO, CANCEL_WARNING_MAX_RATIO } from "@/lib/account";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { suspendFromWatchlist } from "./actions";

const SUSPENSION_DURATION_OPTIONS = [
  { label: "1 hour", value: "1" },
  { label: "6 hours", value: "6" },
  { label: "1 day", value: "24" },
  { label: "3 days", value: "72" },
  { label: "7 days", value: "168" },
  { label: "30 days", value: "720" },
  { label: "Indefinite", value: "indefinite" },
] as const;

function cancelRatio(player: WatchlistPlayer) {
  return player.cancelCount / (player.cancelCount + player.gamesPlayed);
}

function PlayerRow({ player, showSuspendAction }: { player: WatchlistPlayer; showSuspendAction: boolean }) {
  return (
    <Card className="py-0">
      <CardContent className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <Link href={`/players/${player.id}`} className="font-medium hover:underline">
            {player.username}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {player.cancelCount} cancels / {player.gamesPlayed} played ({Math.round(cancelRatio(player) * 100)}%) ·{" "}
            {player.noShowCount} no-shows · misconduct {player.misconductScore}
            {player.openReportCount > 0 && (
              <>
                {" · "}
                <Link href="/admin/reports" className="text-amber-600 hover:underline dark:text-amber-400">
                  {player.openReportCount} open report{player.openReportCount === 1 ? "" : "s"}
                </Link>
              </>
            )}
          </p>
        </div>
        {showSuspendAction && (
          <form action={suspendFromWatchlist.bind(null, player.id)} className="flex items-center gap-1.5">
            <select
              name="suspensionHours"
              defaultValue="24"
              className="h-7 rounded-lg border border-border bg-background px-1.5 text-xs text-foreground outline-none focus-visible:border-ring"
            >
              {SUSPENSION_DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              name="customHours"
              min={1}
              placeholder="or custom hrs"
              className="h-7 w-24 rounded-lg border border-border bg-background px-1.5 text-xs text-foreground outline-none focus-visible:border-ring"
            />
            <Button type="submit" variant="secondary" size="sm">
              Suspend
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default async function AdminWatchlistPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user?.id || (role !== "MOD" && role !== "ADMIN")) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
        <p className="mt-2 text-sm text-muted-foreground">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const { suspendThreshold, warningThreshold } = await getSuspendWatchlist();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        ACTIVE players whose cancel history already crosses the site&apos;s own auto-suspend thresholds — cancelMatch
        only checks this at the moment of a qualifying cancel, so anyone whose auto-suspend already lapsed and kept
        playing sits here unflagged until this page (or their next cancel) catches it again.
      </p>

      <h2 className="mt-8 text-sm font-semibold text-destructive">
        At the suspend threshold ({">"}
        {Math.round(CANCEL_SUSPEND_MAX_RATIO * 100)}% cancel rate) — {suspendThreshold.length}
      </h2>
      <div className="mt-2 flex flex-col gap-2">
        {suspendThreshold.length === 0 && (
          <p className="text-sm text-muted-foreground">No one currently crosses this line.</p>
        )}
        {suspendThreshold.map((player) => (
          <PlayerRow key={player.id} player={player} showSuspendAction />
        ))}
      </div>

      <h2 className="mt-8 text-sm font-semibold text-amber-600 dark:text-amber-400">
        At the warning threshold ({">"}
        {Math.round(CANCEL_WARNING_MAX_RATIO * 100)}% cancel rate) — {warningThreshold.length}
      </h2>
      <div className="mt-2 flex flex-col gap-2">
        {warningThreshold.length === 0 && (
          <p className="text-sm text-muted-foreground">No one currently in this range.</p>
        )}
        {warningThreshold.map((player) => (
          <PlayerRow key={player.id} player={player} showSuspendAction={false} />
        ))}
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Suspending here goes through the same path as a manual suspend elsewhere — it&apos;s recorded as an ACTIONED
        conduct report and bumps misconduct score.
      </p>
      <Badge variant="outline" className="mt-2">
        Not a queue — recomputed fresh on every visit, nothing to dismiss
      </Badge>
    </main>
  );
}
