import { CalendarClock, Swords, Users } from "lucide-react";
import { getLadderActivity, getRatingDistribution, getStatsTotals } from "@/lib/public-stats";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { Card, CardContent } from "@/components/ui/card";
import { MatchesPerDayChart } from "@/components/matches-per-day-chart";
import { MatchesByHourChart } from "@/components/matches-by-hour-chart";
import { LocalTimeZoneLabel } from "@/components/local-time-zone-label";
import { RatingDistributionChart } from "@/components/rating-distribution-chart";
import { SectionHeading } from "@/components/section-heading";
import { StatCard } from "@/components/stat-card";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

const WINDOW_DAYS = 90;

export async function StatsOverviewSection({ lang }: { lang: Lang }) {
  // The two activity charts share one read — see getLadderActivity; the rating
  // distribution and headline totals are separate populations, read alongside it.
  const [{ timestamps }, { buckets, total, average, median }, totals] = await Promise.all([
    getLadderActivity(WINDOW_DAYS),
    getRatingDistribution(),
    getStatsTotals(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={CalendarClock}
          label={tr(lang, { en: "Matches this season", es: "Partidas esta temporada", ja: "今シーズンの試合数" })}
          value={totals.matchesThisSeason}
        />
        <StatCard
          icon={Swords}
          label={tr(lang, { en: "Matches all time", es: "Partidas en total", ja: "通算の試合数" })}
          value={totals.matchesAllTime}
        />
        <StatCard
          icon={Users}
          label={tr(lang, { en: "Ranked players", es: "Jugadores clasificados", ja: "ランク対象プレイヤー" })}
          value={totals.rankedPlayers}
        />
      </div>

      <section>
        <SectionHeading
          label={tr(lang, { en: "Matches per day", es: "Partidas por día", ja: "1日あたりの試合数" })}
          action={
            <span className="text-xs text-muted-foreground">
              {tr(lang, { en: `${WINDOW_DAYS} days`, es: `${WINDOW_DAYS} días`, ja: `${WINDOW_DAYS}日間` })}
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
          label={tr(lang, { en: "Activity by time of day", es: "Actividad por hora del día", ja: "時間帯別の活動" })}
          action={<LocalTimeZoneLabel />}
        />
        <Card className="mt-3">
          <CardContent className="pt-4">
            <MatchesByHourChart timestamps={timestamps} windowDays={WINDOW_DAYS} lang={lang} />
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionHeading
          label={tr(lang, { en: "Rating distribution", es: "Distribución de clasificación", ja: "レート分布" })}
          action={
            <span className="text-xs text-muted-foreground">
              {LEADERBOARD_MIN_GAMES}+ {tr(lang, { en: "sets", es: "partidas", ja: "セット" })}
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
