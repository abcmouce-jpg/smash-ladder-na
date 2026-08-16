"use client";

import { useSyncExternalStore, useState } from "react";

const WIDTH = 560;
const HEIGHT = 140;
const PAD_LEFT = 30;
const PAD_RIGHT = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 20;
const DAY_MS = 86_400_000;

// Same timezone-safe day-bucketing approach as MatchesPerDayChart (see its
// own comment) — generalized here so admin analytics charts don't each
// reimplement it. Kept as a separate component rather than a shared base for
// both because the public chart has its own copy tuned to its exact page
// (Spanish strings, "matches" specifically) and isn't worth risking a
// regression on to consolidate.
const subscribe = () => () => {};

function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function TimeSeriesChart({
  timestamps,
  days = 90,
  label,
  color = "oklch(0.6 0.19 255)",
  emptyMessage,
}: {
  timestamps: string[];
  days?: number;
  label: string;
  color?: string;
  emptyMessage: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const tz = useBrowserTimeZone() ?? "UTC";

  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayKey = (date: Date) => dayFormatter.format(date);

  const todayMidnight = Date.parse(`${dayKey(new Date())}T00:00:00Z`);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(dayKey(new Date(todayMidnight - i * DAY_MS)));
  }

  const counts = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const ts of timestamps) {
    const key = dayKey(new Date(ts));
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }
  const series = keys.map((key) => ({ key, count: counts.get(key)! }));
  const total = series.reduce((sum, d) => sum + d.count, 0);

  const dateLabel = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return `${MONTHS[month - 1]} ${day}, ${year}`;
  };

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const max = Math.max(...series.map((d) => d.count));
  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slotW = plotW / days;
  const y = (count: number) => PAD_TOP + (1 - count / max) * plotH;
  const pointX = (i: number) => PAD_LEFT + (i + 0.5) * slotW;
  const gridLines = [...new Set([0, Math.round(max / 2), max])];
  const linePath = series.map((d, i) => `${i === 0 ? "M" : "L"}${pointX(i)},${y(d.count)}`).join(" ");
  const areaPath = `${linePath} L${pointX(days - 1)},${y(0)} L${pointX(0)},${y(0)} Z`;
  const labelEvery = days > 45 ? 10 : 5;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const index = Math.min(days - 1, Math.max(0, Math.floor((relX - PAD_LEFT) / slotW)));
    setHoverIndex(index);
  }

  const hovered = hoverIndex !== null ? series[hoverIndex] : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
        role="img"
        aria-label={`${label} over the last ${days} days`}
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

        <path d={areaPath} fill={color} fillOpacity={0.1} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {series.map((d, i) => (
          <circle key={d.key} cx={pointX(i)} cy={y(d.count)} r={2} fill={color} />
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
              fill={color}
              stroke="var(--background)"
              strokeWidth={2}
            />
          </g>
        )}

        {series.map((d, i) => {
          if ((days - 1 - i) % labelEvery !== 0) return null;
          const anchor = i === days - 1 ? "end" : i === 0 ? "start" : "middle";
          const [, month, day] = d.key.split("-").map(Number);
          return (
            <text
              key={d.key}
              x={pointX(i)}
              y={HEIGHT - 5}
              textAnchor={anchor}
              className="fill-muted-foreground"
              style={{ fontSize: 9 }}
            >
              {MONTHS[month - 1]} {day}
            </text>
          );
        })}
      </svg>

      <div className="flex h-5 items-center justify-center text-xs text-muted-foreground">
        {hovered && hoverIndex !== null
          ? `${dateLabel(hovered.key)} — ${hovered.count} ${label.toLowerCase()}`
          : `${total} ${label.toLowerCase()} in the last ${days} days`}
      </div>
    </div>
  );
}
