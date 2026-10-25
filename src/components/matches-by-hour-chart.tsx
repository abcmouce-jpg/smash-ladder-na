"use client";

import { useBrowserTimeZone } from "@/hooks/use-browser-time-zone";
import { shortTimeZoneName } from "@/lib/timezone";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

// Average confirmed matches per hour of day (viewer's timezone), as a
// 24-column bar chart. Hover tooltips via the title attribute, plus an
// accessible summary line, since this is a static community-stats block rather
// than something needing chart interactions. The bucketing into hours happens
// here, not server-side, because hour boundaries depend on the visitor's
// timezone and only the browser knows that — via useBrowserTimeZone, so the
// first paint is UTC (matching SSR) and swaps to the browser's zone on re-render.
export function MatchesByHourChart({
  timestamps,
  windowDays,
  lang,
}: {
  timestamps: string[];
  windowDays: number;
  lang: Lang;
}) {
  const tz = useBrowserTimeZone() ?? "UTC";

  // Hours in the viewer's timezone, 0–23. Matches outside the window are
  // already excluded by the query in getLadderActivity.
  const hourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hourCycle: "h23",
  });
  const hourlyCounts = new Array<number>(24).fill(0);
  for (const ts of timestamps) {
    const hour = Number(hourFormatter.format(new Date(ts)));
    if (Number.isInteger(hour) && hour >= 0 && hour < 24) hourlyCounts[hour]++;
  }

  const averages = hourlyCounts.map((count) => count / windowDays);
  const max = Math.max(...averages);
  const total = hourlyCounts.reduce((sum, c) => sum + c, 0);
  const dailyAverage = Math.round(total / windowDays);

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {tr(lang, {
          en: `Not enough confirmed matches in the last ${windowDays} days yet.`,
          es: `Aún no hay suficientes partidas confirmadas en los últimos ${windowDays} días.`,
          ja: `直近${windowDays}日間に確定した試合が足りません。`,
        })}
      </p>
    );
  }

  const hourLabel = (hour: number) => {
    const period = hour < 12 ? "am" : "pm";
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}${period}`;
  };

  const perDaySuffix = tr(lang, { en: "/day", es: "/día", ja: "/日" });

  return (
    <div>
      <div
        role="img"
        aria-label={tr(lang, {
          en: "Average matches by hour",
          es: "Partidas promedio por hora",
          ja: "時間帯別の平均試合数",
        })}
      >
        <div className="flex h-40 items-end gap-[3px]">
          {averages.map((avg, hour) => {
            const pct = max > 0 ? Math.max(2, Math.round((avg / max) * 100)) : 0;
            return (
              <div
                key={hour}
                title={`${hourLabel(hour)} — ${avg.toFixed(1)}${perDaySuffix}`}
                className="flex h-full flex-1 flex-col justify-end"
              >
                <div
                  className={`w-full rounded-t-sm ${
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
        {tr(lang, {
          en: `${total} confirmed matches over ${windowDays} days — ${dailyAverage} per day on average (${shortTimeZoneName(tz)})`,
          es: `${total} partidas confirmadas en ${windowDays} días — ${dailyAverage} por día en promedio (${shortTimeZoneName(tz)})`,
          ja: `${windowDays}日間で確定した試合 ${total}件 — 1日平均${dailyAverage}件（${shortTimeZoneName(tz)}）`,
        })}
      </p>
    </div>
  );
}
