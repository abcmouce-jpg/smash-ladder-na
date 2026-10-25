import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { auth } from "@/auth";
import { NEXT_SEASON_ALGORITHM, canManageSeasons, ensureActiveSeason, listPastSeasons } from "@/lib/seasons";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EndSeasonButton } from "@/components/end-season-button";
import { SeasonAlgorithmForm } from "@/components/season-algorithm-form";
import { RATING_ALGORITHM_LABEL } from "@/lib/rating-algorithm";
import { prisma } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";
import { endSeason, setActiveSeasonAlgorithmAction } from "./actions";

export default async function SeasonsAdminPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user?.id || (role !== "MOD" && role !== "ADMIN")) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Seasons</h1>
        <p className="mt-2 text-sm text-muted-foreground">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const [active, past] = await Promise.all([ensureActiveSeason(), listPastSeasons()]);
  // The algorithm is only changeable while the season has rated nothing — the
  // same condition setActiveSeasonAlgorithm enforces, asked here so the form
  // isn't offered for something the server would refuse.
  const ratedCount = await prisma.ratingMatch.count({
    where: {
      seasonId: active.id,
      status: MatchStatus.CONFIRMED,
      NOT: { player1IsPracticing: true, player2IsPracticing: true },
    },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
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
          <p className="mt-1 text-xs text-muted-foreground">Started {active.startsAt.toLocaleDateString()}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Rating system: {RATING_ALGORITHM_LABEL[active.algorithm]}
            {ratedCount > 0 && ` · ${ratedCount} ${ratedCount === 1 ? "set" : "sets"} rated`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {active.scheduledEndAt
              ? `Auto-ends ${active.scheduledEndAt.toLocaleString()}`
              : "No scheduled end — manual only"}
          </p>
          <div className="mt-3">
            {canManageSeasons(session.user.id) ? (
              <EndSeasonButton action={endSeason} seasonName={active.name} />
            ) : (
              <p className="text-xs text-muted-foreground">Ending a season is restricted to the season managers.</p>
            )}
          </div>
          {ratedCount === 0 && canManageSeasons(session.user.id) && (
            <div className="mt-3">
              <SeasonAlgorithmForm
                action={setActiveSeasonAlgorithmAction}
                current={active.algorithm}
                seasonName={active.name}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Only while this season has rated nothing. NEXT_SEASON_ALGORITHM decides what a season gets when it is
                created, so a season that opened before the site&apos;s rating system was settled keeps the old math
                until it is changed here.
              </p>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Snapshots the current leaderboard ({LEADERBOARD_MIN_GAMES}+ sets) as final standings, then resets
            everyone&apos;s rating and practice rating to 1500, and sets played to 0. The next season starts fresh on
            the rating system chosen above ({RATING_ALGORITHM_LABEL[NEXT_SEASON_ALGORITHM]} by default).
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
                        {season.startsAt.toLocaleDateString()} – {season.endsAt?.toLocaleDateString()}
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
