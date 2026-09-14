import type { Lang } from "@/lib/i18n";

// Average confirmed matches per hour of day (ladder reference timezone), as
// a 24-column bar chart. Pure presentational/server-safe — hover tooltips via
// the title attribute, plus an accessible summary line, since this is a
// static community-stats block rather than something needing chart
// interactions.
export function MatchesByHourChart({
  hourlyCounts,
  windowDays,
  lang,
}: {
  hourlyCounts: number[];
  windowDays: number;
  lang: Lang;
}) {
  const averages = hourlyCounts.map((count) => count / windowDays);
  const max = Math.max(...averages);
  const total = hourlyCounts.reduce((sum, c) => sum + c, 0);
  const dailyAverage = Math.round(total / windowDays);

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "es"
          ? `Aún no hay suficientes partidas confirmadas en los últimos ${windowDays} días.`
          : `Not enough confirmed matches in the last ${windowDays} days yet.`}
      </p>
    );
  }

  const hourLabel = (hour: number) => {
    const period = hour < 12 ? "am" : "pm";
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}${period}`;
  };

  return (
    <div>
      <div role="img" aria-label={lang === "es" ? "Partidas promedio por hora" : "Average matches by hour"}>
        <div className="flex h-40 items-end gap-[3px]">
          {averages.map((avg, hour) => {
            const pct = max > 0 ? Math.max(2, Math.round((avg / max) * 100)) : 0;
            return (
              <div
                key={hour}
                title={`${hourLabel(hour)} — ${avg.toFixed(1)}/día`}
                className="flex h-full flex-1 flex-col justify-end"
              >
                <div
                  className={`w-full rounded-t-sm ${hour === 0 ? "" : ""} ${
                    avg >= max * 0.75 ? "bg-primary" : avg >= max * 0.4 ? "bg-primary/60" : "bg-primary/30"
                  }`}
                  style={{ height: `${pct}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-[3px] text-[9px] text-muted-foreground tabular-nums">
          {averages.map((_, hour) => (
            <div key={hour} className="flex-1 text-center">
              {hour % 3 === 0 ? hourLabel(hour) : ""}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground tabular-nums">
        {lang === "es"
          ? `${total} partidas confirmadas en ${windowDays} días — ${dailyAverage} por día en promedio (hora del Este)`
          : `${total} confirmed matches over ${windowDays} days — ${dailyAverage} per day on average (Eastern time)`}
      </p>
    </div>
  );
}
