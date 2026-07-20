import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { auth } from "@/auth";
import { SEASON_MANAGER_USER_ID, ensureActiveSeason, listPastSeasons } from "@/lib/seasons";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EndSeasonButton } from "@/components/end-season-button";
import { endSeason } from "./actions";

export default async function SeasonsAdminPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user?.id || (role !== "MOD" && role !== "ADMIN")) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Seasons</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have access to this page.
        </p>
      </main>
    );
  }

  const [active, past] = await Promise.all([ensureActiveSeason(), listPastSeasons()]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Seasons</h1>
      </div>

      <Card className="mt-6">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{active.name}</p>
            <Badge variant="success">active</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Started {active.startsAt.toLocaleDateString()}
          </p>
          <div className="mt-3">
            {!SEASON_MANAGER_USER_ID || session.user.id === SEASON_MANAGER_USER_ID ? (
              <EndSeasonButton action={endSeason.bind(null, "")} seasonName={active.name} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Ending a season is restricted to one admin for now.
              </p>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Snapshots the current leaderboard (10+ games) as final standings, then resets
            everyone&apos;s rating to 1500 and games played to 0.
          </p>
        </CardContent>
      </Card>

      {past.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-muted-foreground">Past seasons</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {past.map((season) => (
              <li key={season.id}>
                <Link href={`/seasons/${season.id}`}>
                  <Card className="transition-colors hover:border-foreground/30">
                    <CardContent className="flex items-center justify-between pt-4">
                      <p className="text-sm">{season.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {season.startsAt.toLocaleDateString()} –{" "}
                        {season.endsAt?.toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
