"use client";

import { useState } from "react";
import type { Lang } from "@/lib/i18n";

const WIDTH = 640;
const HEIGHT = 220;
const PAD_LEFT = 40;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;

// Rounds the Y domain out to a clean step (10/25/50/100/250/500) so axis
// ticks read as round numbers instead of whatever the data's min/max happen
// to be — same reasoning as marks-and-anatomy.md's axis guidance.
function niceStep(range: number): number {
  const steps = [10, 25, 50, 100, 250, 500, 1000];
  return steps.find((s) => range / s <= 4) ?? 1000;
}

export function RatingTrendChart({
  data,
  lang,
}: {
  data: { date: Date; rating: number }[];
  lang: Lang;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "es"
          ? "Todavía no hay suficientes partidas confirmadas para una gráfica."
          : "Not enough confirmed matches yet for a trend line."}
      </p>
    );
  }

  const ratings = data.map((d) => d.rating);
  const rawMin = Math.min(...ratings);
  const rawMax = Math.max(...ratings);
  const step = niceStep(Math.max(rawMax - rawMin, 1));
  const yMin = Math.floor(rawMin / step) * step;
  const yMax = Math.ceil(rawMax / step) * step || yMin + step;

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const x = (i: number) => PAD_LEFT + (i / (data.length - 1)) * plotWidth;
  const y = (rating: number) => PAD_TOP + (1 - (rating - yMin) / (yMax - yMin)) * plotHeight;

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.rating).toFixed(1)}`).join(" ");

  const ticks = [yMin, yMin + (yMax - yMin) / 2, yMax];
  const last = data[data.length - 1];
  const hovered = hoverIndex !== null ? data[hoverIndex] : null;

  function handleMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const nearest = Math.round(((px - PAD_LEFT) / plotWidth) * (data.length - 1));
    setHoverIndex(Math.min(data.length - 1, Math.max(0, nearest)));
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={lang === "es" ? "Gráfica de clasificación a lo largo del tiempo" : "Rating over time chart"}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text x={PAD_LEFT - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
              {Math.round(t)}
            </text>
          </g>
        ))}

        {hoverIndex !== null && (
          <line
            x1={x(hoverIndex)}
            x2={x(hoverIndex)}
            y1={PAD_TOP}
            y2={HEIGHT - PAD_BOTTOM}
            stroke="var(--border)"
            strokeWidth={1}
          />
        )}

        <path d={linePath} fill="none" className="stroke-primary" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {hovered && (
          <circle cx={x(hoverIndex!)} cy={y(hovered.rating)} r={5} className="fill-primary" stroke="var(--background)" strokeWidth={2} />
        )}

        <circle cx={x(data.length - 1)} cy={y(last.rating)} r={5} className="fill-primary" stroke="var(--background)" strokeWidth={2} />
        <text x={x(data.length - 1)} y={y(last.rating) - 10} textAnchor="end" className="fill-foreground text-xs font-medium">
          {Math.round(last.rating)}
        </text>

        {/* Transparent hit layer spanning the full plot — the crosshair snaps to
            the nearest point on pointer move rather than requiring a precise hit
            on the 2px line itself. */}
        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIndex(null)}
        />
      </svg>

      {hovered && hoverIndex !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm"
          style={{ left: `${(x(hoverIndex) / WIDTH) * 100}%` }}
        >
          <div className="font-medium tabular-nums">{Math.round(hovered.rating)}</div>
          <div className="text-muted-foreground">
            {hovered.date.toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { dateStyle: "medium" })}
          </div>
        </div>
      )}
    </div>
  );
}
