import { getMatchesByHour, getMatchesPerDay } from "@/lib/public-stats";
import { Card, CardContent } from "@/components/ui/card";
import { MatchesPerDayChart } from "@/components/matches-per-day-chart";
import { MatchesByHourChart } from "@/components/matches-by-hour-chart";
import { SectionHeading } from "@/components/section-heading";
import type { Lang } from "@/lib/i18n";

const WINDOW_DAYS = 90;

export async function StatsOverviewSection({ lang }: { lang: Lang }) {
  const [timestamps, { hourlyCounts }] = await Promise.all([
    getMatchesPerDay(WINDOW_DAYS),
    getMatchesByHour(WINDOW_DAYS),
  ]);

  return (
    <div className="flex flex-col gap-8">
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
    </div>
  );
}
