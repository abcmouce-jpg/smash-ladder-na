import { CalendarClock, Swords, Users } from "lucide-react";
import { getLadderActivity, getRatingDistribution, getStatsTotals } from "@/lib/public-stats";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { Card, CardContent } from "@/components/ui/card";
import { MatchesPerDayChart } from "@/components/matches-per-day-chart";
import { MatchesByHourChart } from "@/components/matches-by-hour-chart";
import { RatingDistributionChart } from "@/components/rating-distribution-chart";
import { SectionHeading } from "@/components/section-heading";
import { StatCard } from "@/components/stat-card";
import type { Lang } from "@/lib/i18n";

const WINDOW_DAYS = 90;

export async function StatsOverviewSection({ lang }: { lang: Lang }) {
  // The two activity charts share one read — see getLadderActivity; the rating
  // distribution and headline totals are separate populations, read alongside it.
  const [{ timestamps, hourlyCounts }, { buckets, total, average, median }, totals] = await Promise.all([
    getLadderActivity(WINDOW_DAYS),
    getRatingDistribution(),
    getStatsTotals(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={CalendarClock}
          label={lang === "es" ? "Partidas esta temporada" : "Matches this season"}
          value={totals.matchesThisSeason}
        />
        <StatCard
          icon={Swords}
          label={lang === "es" ? "Partidas en total" : "Matches all time"}
          value={totals.matchesAllTime}
        />
        <StatCard
          icon={Users}
          label={lang === "es" ? "Jugadores clasificados" : "Ranked players"}
          value={totals.rankedPlayers}
        />
      </div>

      <section>
        <SectionHeading
          label={lang === "es" ? "Partidas por día" : "Matches per day"}
          action={
            <span className="text-xs text-muted-foreground">
              {lang === "es" ? `${WINDOW_DAYS} días` : `${WINDOW_DAYS} days`}
            </span>
          }
        />
        <Card className="mt-3">
          <CardContent className="pt-4">
            <MatchesPerDayChart timestamps={timestamps} lang={lang} days={WINDOW_DAYS} />
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionHeading
          label={lang === "es" ? "Actividad por hora del día" : "Activity by time of day"}
          action={
            <span className="text-xs text-muted-foreground">{lang === "es" ? "Hora del Este" : "Eastern time"}</span>
          }
        />
        <Card className="mt-3">
          <CardContent className="pt-4">
            <MatchesByHourChart hourlyCounts={hourlyCounts} windowDays={WINDOW_DAYS} lang={lang} />
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionHeading
          label={lang === "es" ? "Distribución de clasificación" : "Rating distribution"}
          action={
            <span className="text-xs text-muted-foreground">
              {LEADERBOARD_MIN_GAMES}+ {lang === "es" ? "partidas" : "sets"}
            </span>
          }
        />
        <Card className="mt-3">
          <CardContent className="pt-4">
            <RatingDistributionChart buckets={buckets} total={total} average={average} median={median} lang={lang} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
