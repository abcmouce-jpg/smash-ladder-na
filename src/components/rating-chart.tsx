"use client";

import { useSyncExternalStore, useState } from "react";

type Point = { date: string; rating: number };

// Server-rendered pages don't know the visitor's timezone, so dates render in
// UTC for the first paint — identical to SSR, so no hydration mismatch — and
// switch to the browser's real timezone once mounted. suppressHydrationWarning
// wouldn't work here because the label-placement logic depends on the rendered
// date strings: a label can be placed or skipped differently per timezone.
function formatDate(date: string, timeZone: string) {
  return new Date(date).toLocaleDateString("en-US", { timeZone });
}

const WIDTH = 560;
const HEIGHT = 160;
const PAD_LEFT = 30;
const PAD_RIGHT = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const LABEL_GAP = 6;
const DAY_MS = 86_400_000;

// Server-rendered pages don't know the visitor's timezone, so dates render in
// UTC for the first paint — identical to SSR, so no hydration mismatch — and
// switch to the browser's real timezone once mounted. useSyncExternalStore's
// server snapshot (null → UTC) is used for that first paint; React swaps in
// the client snapshot during the post-hydration re-render, avoiding the
// cascading render that a setState-in-effect would trigger.
const subscribe = () => () => {};

function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

export function RatingChart({ points }: { points: Point[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const tz = useBrowserTimeZone() ?? "UTC";

  // Group into one point per viewer-local calendar day (the last match that
  // day). This must happen here, not server-side: UTC day boundaries can
  // merge matches that fall on different local days for the viewer (e.g. 10pm
  // and midnight in a timezone behind UTC), and only the browser knows the
  // viewer's timezone. Day keys also drive x-axis spacing below, so points
  // stay consistent with the dates they're labeled with.
  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayKey = (date: string) => dayFormatter.format(new Date(date));

  const condensed: Point[] = [];
  for (const p of points) {
    const last = condensed[condensed.length - 1];
    if (last && dayKey(last.date) === dayKey(p.date)) {
      condensed[condensed.length - 1] = p;
    } else {
      condensed.push(p);
    }
  }

  if (condensed.length < 2) {
    return <p className="text-sm text-muted-foreground">Not enough confirmed matches yet.</p>;
  }

  const ratings = condensed.map((p) => p.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const span = Math.max(max - min, 1);
  const yPad = span * 0.15;
  const yMin = min - yPad;
  const yMax = max + yPad;

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  // The x axis is a local-day scale: spacing reflects the calendar-day gap
  // between matches, so a two-day gap is twice as wide as a one-day gap. Day
  // numbers derive from the local-day keys above, so consecutive points always
  // span at least one day and the scale is well defined.
  const dayNumbers = condensed.map((p) => Date.parse(`${dayKey(p.date)}T00:00:00Z`) / DAY_MS);
  const minDay = dayNumbers[0];
  const maxDay = dayNumbers[dayNumbers.length - 1];
  const daySpan = Math.max(maxDay - minDay, 1);

  const x = (i: number) => PAD_LEFT + ((dayNumbers[i] - minDay) / daySpan) * plotW;
  const y = (rating: number) => PAD_TOP + (1 - (rating - yMin) / (yMax - yMin)) * plotH;

  const linePath = condensed.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.rating)}`).join(" ");

  const gridLines = [yMin + (yMax - yMin) * 0.25, yMin + (yMax - yMin) * 0.5, yMin + (yMax - yMin) * 0.75];

  // Date labels along the bottom so the timeline reads at a glance — hovering
  // (below) still gives the exact date+rating for any point, but that's
  // undiscoverable on touch devices, which don't really have a hover state.
  // Every day is a label candidate; ones whose estimated width would collide
  // with an already-placed label are skipped. First and last are always kept.
  const labelWidth = (text: string) => text.length * 5.5;
  const labelRange = (index: number, text: string, anchor: "start" | "middle" | "end"): [number, number] => {
    const cx = x(index);
    const w = labelWidth(text);
    if (anchor === "start") return [cx, cx + w];
    if (anchor === "end") return [cx - w, cx];
    return [cx - w / 2, cx + w / 2];
  };

  const labels: { index: number; text: string; anchor: "start" | "middle" | "end" }[] = [];
  for (let i = 0; i < condensed.length; i++) {
    const anchor = i === 0 ? "start" : i === condensed.length - 1 ? "end" : "middle";
    const text = formatDate(condensed[i].date, tz);
    const [start, end] = labelRange(i, text, anchor);
    const collides = labels.some((placed) => {
      const [ps, pe] = labelRange(placed.index, placed.text, placed.anchor);
      return start < pe + LABEL_GAP && end > ps - LABEL_GAP;
    });
    if (i === 0 || i === condensed.length - 1 || !collides) {
      labels.push({ index: i, text, anchor });
    }
  }

  const hovered = hoverIndex !== null ? condensed[hoverIndex] : null;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    // Points aren't evenly spaced (x reflects the day gap between matches),
    // so find the nearest one by position rather than inferring an index by ratio.
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < condensed.length; i++) {
      const dist = Math.abs(x(i) - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    }
    setHoverIndex(nearest);
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
        role="img"
        aria-label="Rating over recent matches"
      >
        {gridLines.map((gy) => (
          <g key={gy}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={y(gy)}
              y2={y(gy)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PAD_LEFT - 4}
              y={y(gy) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              style={{ fontSize: 9 }}
            >
              {Math.round(gy)}
            </text>
          </g>
        ))}

        <path
          d={linePath}
          fill="none"
          stroke="oklch(0.6 0.19 255)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="dark:[stroke:oklch(0.65_0.17_255)]"
        />

        {hovered && hoverIndex !== null && (
          <g>
            <line
              x1={x(hoverIndex)}
              x2={x(hoverIndex)}
              y1={PAD_TOP}
              y2={HEIGHT - PAD_BOTTOM}
              className="stroke-muted-foreground/40"
              strokeWidth={1}
            />
            <circle
              cx={x(hoverIndex)}
              cy={y(hovered.rating)}
              r={4}
              fill="oklch(0.6 0.19 255)"
              className="dark:[fill:oklch(0.72_0.16_255)]"
              stroke="var(--background)"
              strokeWidth={2}
            />
          </g>
        )}

        {labels.map((l) => (
          <text
            key={l.index}
            x={x(l.index)}
            y={HEIGHT - 6}
            textAnchor={l.anchor}
            className="fill-muted-foreground"
            style={{ fontSize: 9 }}
          >
            {l.text}
          </text>
        ))}
      </svg>

      <div className="flex h-5 items-center justify-center text-xs text-muted-foreground">
        {hovered
          ? `${formatDate(hovered.date, tz)} — ${hovered.rating} rating`
          : `${condensed[0].rating} → ${condensed[condensed.length - 1].rating} over last ${condensed.length} matches`}
      </div>

      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          View as table
        </summary>
        <div className="mt-2 max-h-40 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 font-medium">Date</th>
                <th className="py-1 text-right font-medium tabular-nums">Rating</th>
              </tr>
            </thead>
            <tbody>
              {[...condensed].reverse().map((p) => (
                <tr key={p.date} className="border-t border-border/60">
                  <td className="py-1">{formatDate(p.date, tz)}</td>
                  <td className="py-1 text-right tabular-nums">{p.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
