"use client";

import { useSyncExternalStore, useState } from "react";
import type { Lang } from "@/lib/i18n";

const DAYS = 30;
const WIDTH = 560;
const HEIGHT = 160;
const PAD_LEFT = 30;
const PAD_RIGHT = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const DAY_MS = 86_400_000;

// Same timezone dance as RatingChart: server-rendered pages don't know the
// visitor's timezone, so the first paint buckets by UTC — identical to SSR,
// so no hydration mismatch — and useSyncExternalStore swaps in the browser's
// real timezone during the post-hydration re-render. The bucket counts are
// unchanged; only which matches land in which local day can shift.
const subscribe = () => () => {};

function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function MatchesPerDayChart({ timestamps, lang }: { timestamps: string[]; lang: Lang }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const tz = useBrowserTimeZone() ?? "UTC";

  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayKey = (date: Date) => dayFormatter.format(date);

  // The 30 calendar days ending today in the viewer's timezone, oldest first.
  // Keys are derived from a single representative instant (the viewer's local
  // midnight today) so subtracting whole days can't drift across a day
  // boundary. Labels below are built from the key's parts directly — never
  // by re-formatting a Date, whose UTC instant would shift to the previous
  // local day for negative offsets.
  const todayMidnight = Date.parse(`${dayKey(new Date())}T00:00:00Z`);
  const keys: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    keys.push(dayKey(new Date(todayMidnight - i * DAY_MS)));
  }

  const counts = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const ts of timestamps) {
    const key = dayKey(new Date(ts));
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }
  const days = keys.map((key) => ({ key, count: counts.get(key)! }));
  const total = days.reduce((sum, d) => sum + d.count, 0);

  const months = lang === "es" ? MONTHS_ES : MONTHS_EN;
  const dateLabel = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    if (lang === "es") return `${day} ${months[month - 1]} ${year}`;
    return `${months[month - 1]} ${day}, ${year}`;
  };
  const countLabel = (count: number) =>
    lang === "es"
      ? `${count} ${count === 1 ? "partida" : "partidas"}`
      : `${count} ${count === 1 ? "match" : "matches"}`;

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "es"
          ? "Aún no hay partidas confirmadas en los últimos 30 días."
          : "No confirmed matches in the last 30 days yet."}
      </p>
    );
  }

  const max = Math.max(...days.map((d) => d.count));
  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slotW = plotW / DAYS;
  const y = (count: number) => PAD_TOP + (1 - count / max) * plotH;
  const pointX = (i: number) => PAD_LEFT + (i + 0.5) * slotW;

  const gridLines = [...new Set([0, Math.round(max / 2), max])];

  // The days are evenly spaced (one point per calendar day), so the x scale
  // is a plain slot index — unlike RatingChart, whose points land on the
  // actual days matches happened.
  const linePath = days.map((d, i) => `${i === 0 ? "M" : "L"}${pointX(i)},${y(d.count)}`).join(" ");
  const areaPath = `${linePath} L${pointX(DAYS - 1)},${y(0)} L${pointX(0)},${y(0)} Z`;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const index = Math.min(DAYS - 1, Math.max(0, Math.floor((relX - PAD_LEFT) / slotW)));
    setHoverIndex(index);
  }

  const hovered = hoverIndex !== null ? days[hoverIndex] : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
        role="img"
        aria-label={lang === "es" ? "Partidas por día en los últimos 30 días" : "Matches per day over the last 30 days"}
      >
        {gridLines.map((g) => (
          <g key={g}>
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y(g)} y2={y(g)} className="stroke-border" strokeWidth={1} />
            <text
              x={PAD_LEFT - 4}
              y={y(g) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              style={{ fontSize: 9 }}
            >
              {g}
            </text>
          </g>
        ))}

        <path d={areaPath} fill="oklch(0.6 0.19 255)" fillOpacity={0.1} className="dark:fill-[oklch(0.65_0.17_255)]" />
        <path
          d={linePath}
          fill="none"
          stroke="oklch(0.6 0.19 255)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="dark:stroke-[oklch(0.65_0.17_255)]"
        />
        {days.map((d, i) => (
          <circle
            key={d.key}
            cx={pointX(i)}
            cy={y(d.count)}
            r={2}
            fill="oklch(0.6 0.19 255)"
            className="dark:fill-[oklch(0.65_0.17_255)]"
          />
        ))}

        {hovered && hoverIndex !== null && (
          <g>
            <line
              x1={pointX(hoverIndex)}
              x2={pointX(hoverIndex)}
              y1={PAD_TOP}
              y2={HEIGHT - PAD_BOTTOM}
              className="stroke-muted-foreground/40"
              strokeWidth={1}
            />
            <circle
              cx={pointX(hoverIndex)}
              cy={y(hovered.count)}
              r={4}
              fill="oklch(0.6 0.19 255)"
              className="dark:fill-[oklch(0.72_0.16_255)]"
              stroke="var(--background)"
              strokeWidth={2}
            />
          </g>
        )}

        {/* Every fifth day back from today gets a label; anchors avoid
            clipping at the plot edges. */}
        {days.map((d, i) => {
          if ((DAYS - 1 - i) % 5 !== 0) return null;
          const anchor = i === DAYS - 1 ? "end" : i === 0 ? "start" : "middle";
          const [, month, day] = d.key.split("-").map(Number);
          return (
            <text
              key={d.key}
              x={pointX(i)}
              y={HEIGHT - 6}
              textAnchor={anchor}
              className="fill-muted-foreground"
              style={{ fontSize: 9 }}
            >
              {lang === "es" ? `${day} ${months[month - 1]}` : `${months[month - 1]} ${day}`}
            </text>
          );
        })}
      </svg>

      <div className="flex h-5 items-center justify-center text-xs text-muted-foreground">
        {hovered && hoverIndex !== null
          ? `${dateLabel(days[hoverIndex].key)} — ${countLabel(days[hoverIndex].count)}`
          : lang === "es"
            ? `${total} partidas confirmadas en los últimos 30 días`
            : `${total} confirmed matches in the last 30 days`}
      </div>

      {/* Hover is undiscoverable on touch devices, which is what the
          rating chart's table fallback is for too. */}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          {lang === "es" ? "Ver como tabla" : "View as table"}
        </summary>
        <div className="mt-2 max-h-40 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 font-medium">{lang === "es" ? "Fecha" : "Date"}</th>
                <th className="py-1 text-right font-medium tabular-nums">{lang === "es" ? "Partidas" : "Matches"}</th>
              </tr>
            </thead>
            <tbody>
              {[...days]
                .reverse()
                .filter((d) => d.count > 0)
                .map((d) => (
                  <tr key={d.key} className="border-t border-border/60">
                    <td className="py-1">{dateLabel(d.key)}</td>
                    <td className="py-1 text-right tabular-nums">{d.count}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
