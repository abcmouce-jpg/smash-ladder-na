import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { getActiveSeason } from "@/lib/seasons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { formatRating } from "@/lib/rating-format";
import type { Lang } from "@/lib/i18n";

const MEDALS = ["🥇", "🥈", "🥉"];

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
                // The card is a plain box with a stretched season link over it
                // rather than a <Link> wrapping the whole card: nesting the
                // player links inside it would emit invalid nested anchors, and
                // an onClick to stop that propagation can't be passed from this
                // Server Component.
                <div
                  key={season.id}
                  className="group relative rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:border-foreground/30 focus-within:border-foreground/30"
                >
                  <Link
                    href={`/seasons/${season.id}`}
                    aria-label={
                      lang === "es"
                        ? `Ver la clasificación completa de ${season.name}`
                        : `View the full standings for ${season.name}`
                    }
                    className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {/* Transparent to pointers so clicks fall through to the
                      stretched link, except on the player links below. */}
                  <div className="pointer-events-none">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold">{season.name}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {season.startsAt.toLocaleDateString(dateLocale)} –{" "}
                        {season.endsAt?.toLocaleDateString(dateLocale)}
                      </span>
                    </div>
                    {podium.length > 0 && (
                      <table className="mt-2 w-full text-sm">
                        <tbody>
                          {podium.map((standing) => (
                            <tr key={standing.id}>
                              <td className="w-5 py-0.5 pr-1 text-center" aria-hidden>
                                {standing.rank <= 3 ? MEDALS[standing.rank - 1] : `#${standing.rank}`}
                              </td>
                              <td className="py-0.5 pr-3">
                                <Link
                                  href={`/players/${standing.user.id}`}
                                  className="pointer-events-auto relative font-medium hover:underline"
                                >
                                  {standing.user.username}
                                </Link>
                              </td>
                              <td className="py-0.5 text-right text-xs tabular-nums text-muted-foreground">
                                {formatRating(standing.finalRating)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
