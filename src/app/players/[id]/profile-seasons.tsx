import Link from "next/link";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { getActiveSeason, listPastSeasons } from "@/lib/seasons";
import { getPlayerSeasonRecords } from "@/lib/profile-stats";
import type { Lang } from "@/lib/i18n";

const PLACEMENT_MEDALS = ["🥇", "🥈", "🥉"] as const;

// This player's history across seasons: the active season up top (record so
// far plus a hop to the live leaderboard), then each past season they played
// or placed in, most recent first. Rows come from two independent sources —
// the snapshotted SeasonStanding (rank/final rating, written once at
// rollover) and the player's own confirmed-match records grouped per
// seasonId — because a player who didn't qualify for standings can still
// have a season record, and vice versa for someone who never played ranked
// sets that season (only rollover top-ups write standings rows).
export async function ProfileSeasonsSection({ id, lang }: { id: string; lang: Lang }) {
  const dateLocale = lang === "es" ? "es-MX" : "en-US";
  const [activeSeason, pastSeasons, standings, seasonRecords] = await Promise.all([
    getActiveSeason(),
    listPastSeasons(),
    prisma.seasonStanding.findMany({
      where: { userId: id },
      select: { seasonId: true, rank: true, finalRating: true },
    }),
    getPlayerSeasonRecords(id),
  ]);
  const standingBySeason = new Map(standings.map((s) => [s.seasonId, s]));
  const recordBySeason = new Map(seasonRecords.map((r) => [r.seasonId, r]));
  const participatedPast = pastSeasons.filter((s) => standingBySeason.has(s.id) || recordBySeason.has(s.id));
  const activeRecord = activeSeason ? (recordBySeason.get(activeSeason.id) ?? null) : null;

  return (
    <div className="flex flex-col gap-3">
      {activeSeason && (
        <Card className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <p className="text-sm font-medium">{activeSeason.name}</p>
            <p className="text-xs text-muted-foreground">
              {lang === "es" ? "En curso desde " : "In progress since "}
              {activeSeason.startsAt.toLocaleDateString(dateLocale)}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <p className="flex items-baseline gap-2">
              <span className="font-semibold tabular-nums">
                {activeRecord ? `${activeRecord.wins}W–${activeRecord.losses}L` : "0W–0L"}
              </span>
              <span className="text-xs text-muted-foreground">
                {lang === "es" ? "récord de temporada" : "season record"}
              </span>
            </p>
            <Link
              href="/leaderboard"
              prefetch={false}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {lang === "es" ? "Tabla actual →" : "Current leaderboard →"}
            </Link>
          </div>
        </Card>
      )}

      {participatedPast.map((season) => {
        const standing = standingBySeason.get(season.id) ?? null;
        const record = recordBySeason.get(season.id) ?? null;
        return (
          <Card key={season.id} className="p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <p className="text-sm font-medium">{season.name}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {season.startsAt.toLocaleDateString(dateLocale)} – {season.endsAt?.toLocaleDateString(dateLocale)}
              </p>
            </div>
            {standing && (
              <p
                className={
                  standing.rank <= 3
                    ? "mt-2 flex items-center gap-1.5 text-sm font-medium"
                    : "mt-2 text-sm text-muted-foreground"
                }
              >
                {standing.rank <= 3 ? (
                  <>
                    <span aria-hidden>{PLACEMENT_MEDALS[standing.rank - 1]}</span>
                    <span>
                      {lang === "es"
                        ? standing.rank === 1
                          ? "Campeón"
                          : standing.rank === 2
                            ? "Subcampeón"
                            : "3er lugar"
                        : standing.rank === 1
                          ? "Champion"
                          : standing.rank === 2
                            ? "Runner-up"
                            : "3rd Place"}
                    </span>
                    <span className="font-normal text-muted-foreground tabular-nums">
                      — {standing.finalRating} {lang === "es" ? "de clasificación" : "rating"}
                    </span>
                  </>
                ) : lang === "es" ? (
                  `Finalizó en el #${standing.rank} con ${standing.finalRating} de clasificación`
                ) : (
                  `Finished #${standing.rank} with ${standing.finalRating} rating`
                )}
              </p>
            )}
            {record && (
              <p className="mt-1 flex items-baseline gap-2 text-sm">
                <span className="font-semibold tabular-nums">
                  {record.wins}W–{record.losses}L
                </span>
                <span className="text-xs text-muted-foreground">
                  {lang === "es" ? "récord de temporada" : "season record"}
                </span>
              </p>
            )}
            <div className="mt-2 text-xs">
              <Link
                href={`/seasons/${season.id}`}
                prefetch={false}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                {lang === "es" ? "Ver clasificación final →" : "View final standings →"}
              </Link>
            </div>
          </Card>
        );
      })}

      {participatedPast.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {lang === "es" ? "Aún no hay historial de temporadas anteriores." : "No past-season history yet."}
        </p>
      )}
    </div>
  );
}
