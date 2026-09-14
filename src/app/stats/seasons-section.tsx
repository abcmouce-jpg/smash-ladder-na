import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { getActiveSeason } from "@/lib/seasons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import type { Lang } from "@/lib/i18n";

const MEDALS = ["🥇", "🥈", "🥉"];
const PLACEMENT: Record<number, { en: string; es: string }> = {
  1: { en: "Champion", es: "Campeón" },
  2: { en: "Runner-up", es: "Subcampeón" },
  3: { en: "3rd Place", es: "3er lugar" },
  4: { en: "4th Place", es: "4.º lugar" },
  5: { en: "5th Place", es: "5.º lugar" },
};

// How many finalists each past-season card previews before linking out to
// the season's full standings page (which doubles as that season's leaderboard).
const TOP_FINISHERS = 5;

export async function StatsSeasonsSection({ lang }: { lang: Lang }) {
  const dateLocale = lang === "es" ? "es-MX" : "en-US";
  const active = await getActiveSeason();

  const [pastSeasons, podiums] = await Promise.all([
    prisma.season.findMany({ where: { endsAt: { not: null } }, orderBy: { startsAt: "desc" } }),
    prisma.seasonStanding.findMany({
      where: { rank: { lte: TOP_FINISHERS } },
      orderBy: [{ season: { startsAt: "desc" } }, { rank: "asc" }],
      include: {
        season: { select: { id: true } },
        user: { select: { id: true, username: true } },
      },
    }),
  ]);
  const counts =
    pastSeasons.length > 0
      ? await prisma.seasonStanding.groupBy({
          by: ["seasonId"],
          where: { seasonId: { in: pastSeasons.map((s) => s.id) } },
          _count: true,
        })
      : [];

  const podiumBySeason = new Map<string, (typeof podiums)[number][]>();
  for (const standing of podiums) {
    const list = podiumBySeason.get(standing.seasonId);
    if (list) list.push(standing);
    else podiumBySeason.set(standing.seasonId, [standing]);
  }
  const countBySeason = new Map(counts.map((c) => [c.seasonId, c._count]));

  return (
    <div className="flex flex-col gap-8">
      {active && (
        <section>
          <SectionHeading label={lang === "es" ? "Temporada actual" : "Current season"} />
          <Card className="mt-3">
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Trophy className="size-4 text-primary" />
                  <p className="text-sm font-semibold">{active.name}</p>
                  <Badge variant="outline" className="text-xs">
                    {lang === "es" ? "En curso" : "In progress"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {lang === "es" ? "desde el " : "since "}
                    {active.startsAt.toLocaleDateString(dateLocale)}
                  </span>
                </div>
                <Link
                  href="/leaderboard"
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {lang === "es" ? "Clasificación actual" : "Current leaderboard"}
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <section>
        <SectionHeading
          label={lang === "es" ? "Campeones anteriores" : "Past champions"}
          action={pastSeasons.length > 0 && <span className="text-xs text-muted-foreground">{pastSeasons.length}</span>}
        />
        {pastSeasons.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {lang === "es"
              ? "Todavía no ha terminado ninguna temporada — vuelve cuando esta termine."
              : "No seasons have ended yet — check back once this one wraps up."}
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {pastSeasons.map((season) => {
              const podium = podiumBySeason.get(season.id) ?? [];
              const playerCount = countBySeason.get(season.id) ?? 0;
              return (
                <Link
                  key={season.id}
                  href={`/seasons/${season.id}`}
                  className="group rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:border-foreground/30"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold">{season.name}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {season.startsAt.toLocaleDateString(dateLocale)} – {season.endsAt?.toLocaleDateString(dateLocale)}
                    </span>
                  </div>
                  {podium.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {podium.map((standing) => (
                        <span key={standing.id} className="flex items-center gap-1.5 text-sm">
                          <span className="w-5 shrink-0 text-center" aria-hidden>
                            {standing.rank <= 3 ? MEDALS[standing.rank - 1] : `#${standing.rank}`}
                          </span>
                          <Link
                            href={`/players/${standing.user.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium hover:underline"
                          >
                            {standing.user.username}
                          </Link>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {standing.finalRating} {lang === "es" ? "de clasificación" : "rating"}
                          </span>
                          <span className="text-xs text-muted-foreground/70">
                            {lang === "es" ? PLACEMENT[standing.rank].es : PLACEMENT[standing.rank].en}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 flex items-center gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                    {playerCount > 0 ? (
                      <span>
                        {lang === "es"
                          ? `${playerCount} ${playerCount === 1 ? "jugador" : "jugadores"} en la clasificación final`
                          : `${playerCount} player${playerCount === 1 ? "" : "s"} in the final standings`}
                      </span>
                    ) : (
                      <span>{lang === "es" ? "Sin clasificación registrada" : "No standings recorded"}</span>
                    )}
                    <span className="ml-auto flex items-center gap-1 font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                      {lang === "es" ? "Ver clasificación completa" : "Full standings"}
                      <ArrowRight className="size-3" />
                    </span>
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
