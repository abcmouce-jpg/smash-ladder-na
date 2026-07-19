"use client";

import { useState } from "react";

type Point = { date: string; rating: number };

const WIDTH = 560;
const HEIGHT = 160;
const PAD_X = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

export function RatingChart({ points }: { points: Point[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length < 2) {
    return <p className="text-sm text-muted-foreground">Not enough confirmed matches yet.</p>;
  }

  const ratings = points.map((p) => p.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const span = Math.max(max - min, 1);
  const yPad = span * 0.15;
  const yMin = min - yPad;
  const yMax = max + yPad;

  const plotW = WIDTH - PAD_X * 2;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const x = (i: number) => PAD_X + (i / (points.length - 1)) * plotW;
  const y = (rating: number) => PAD_TOP + (1 - (rating - yMin) / (yMax - yMin)) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.rating)}`).join(" ");

  const gridLines = [yMin + (yMax - yMin) * 0.25, yMin + (yMax - yMin) * 0.5, yMin + (yMax - yMin) * 0.75];

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = Math.min(1, Math.max(0, (relX - PAD_X) / plotW));
    setHoverIndex(Math.round(ratio * (points.length - 1)));
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
          <line
            key={gy}
            x1={PAD_X}
            x2={WIDTH - PAD_X}
            y1={y(gy)}
            y2={y(gy)}
            className="stroke-border"
            strokeWidth={1}
          />
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
      </svg>

      <div className="flex h-5 items-center justify-center text-xs text-muted-foreground">
        {hovered
          ? `${new Date(hovered.date).toLocaleDateString()} — ${hovered.rating} rating`
          : `${points[0].rating} → ${points[points.length - 1].rating} over last ${points.length} matches`}
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
              {[...points].reverse().map((p) => (
                <tr key={p.date} className="border-t border-border/60">
                  <td className="py-1">{new Date(p.date).toLocaleDateString()}</td>
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
