"use client";

import { useEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import { playTierUpChime, playVictoryChime } from "@/lib/sound";

const CONFETTI_COLORS = ["#f43f5e", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];

// Directions/colors computed once from plain JS trig (not CSS trig
// functions, for broader browser support) — deterministic, so server and
// client render the identical markup and there's nothing to hydrate wrong.
const CONFETTI_PIECES = Array.from({ length: 20 }, (_, i) => {
  const angle = (Math.PI * 2 * i) / 20;
  const distance = 50 + (i % 3) * 18;
  return {
    dx: Math.round(Math.cos(angle) * distance),
    dy: Math.round(Math.sin(angle) * distance - 30),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: (i % 4) * 40,
  };
});

function ConfettiBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {CONFETTI_PIECES.map((p, i) => (
        <span
          key={i}
          className="confetti-piece absolute left-1/2 top-1/2 size-1.5 rounded-sm"
          style={
            {
              backgroundColor: p.color,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              animationDelay: `${p.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function useCountUp(from: number, to: number) {
  const [value, setValue] = useState(from);
  const fromRef = useRef(from);

  useEffect(() => {
    fromRef.current = value;
    const start = fromRef.current;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || start === to) {
      setValue(to);
      return;
    }

    const duration = 700;
    const startTime = performance.now();
    let raf: number;
    function tick(now: number) {
      const progress = Math.min(1, (now - startTime) / duration);
      setValue(Math.round(start + (to - start) * progress));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the target changes, not on every render
  }, [to]);

  return value;
}

export function VictoryCelebration({
  ratingBefore,
  ratingAfter,
  tierUp,
  tierName,
}: {
  ratingBefore: number;
  ratingAfter: number;
  tierUp: boolean;
  tierName?: string;
}) {
  const displayRating = useCountUp(ratingBefore, ratingAfter);
  const delta = ratingAfter - ratingBefore;

  useEffect(() => {
    if (tierUp) playTierUpChime();
    else playVictoryChime();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once when this celebration mounts, not on every prop change
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-primary/5 px-4 py-6 text-center">
      <ConfettiBurst />
      <div className="victory-pop relative flex flex-col items-center gap-1">
        <Trophy className="size-6 text-primary" />
        <p className="text-xl font-bold tracking-tight text-primary">
          {tierUp && tierName ? `Tier up — ${tierName}!` : "Victory!"}
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{displayRating}</p>
        <p className="text-sm font-medium tabular-nums text-primary">
          +{delta} rating
        </p>
      </div>
    </div>
  );
}
