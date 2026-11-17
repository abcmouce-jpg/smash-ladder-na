"use client";

import { useEffect, useState } from "react";

// What the search looks like once a given amount of waiting has passed —
// built on the server (see wideningSteps in app/lobby/page.tsx) from the same
// functions pairing itself uses, so this can't claim a radius the matcher
// isn't actually using. Only steps that change something are included.
export type WideningStep = { afterMs: number; summary: string };

function reachedSummary(steps: readonly WideningStep[], joinedAtMs: number) {
  const waited = Date.now() - joinedAtMs;
  // Last step whose time has come; the list is ascending.
  let summary: string | null = null;
  for (const step of steps) {
    if (waited >= step.afterMs) summary = step.summary;
  }
  return summary;
}

/**
 * The "your settings have been loosened" line in the searching card.
 *
 * Renders nothing until the first step is reached, which is most of the
 * waits — a player who matches in twenty seconds never sees it. It exists so
 * that a widened match is explained before it happens rather than looking
 * like the filters were ignored.
 *
 * Ticks on its own second-by-second rather than waiting for the page's ~5s
 * server poll, for the same reason QueueTimer does: the two sit next to each
 * other and a line that appears four seconds late next to a running clock
 * reads as a bug.
 */
export function QueueWidening({ joinedAt, steps }: { joinedAt: string; steps: readonly WideningStep[] }) {
  const joinedAtMs = new Date(joinedAt).getTime();
  const [summary, setSummary] = useState(() => reachedSummary(steps, joinedAtMs));

  useEffect(() => {
    // Only ever from the interval, like QueueTimer: the first value comes from
    // the initializer above, and a changed prop is picked up on the next tick.
    const id = setInterval(() => setSummary(reachedSummary(steps, joinedAtMs)), 1000);
    return () => clearInterval(id);
  }, [steps, joinedAtMs]);

  if (!summary) return null;
  return (
    <p className="mt-1 text-xs text-muted-foreground" suppressHydrationWarning>
      {summary}
    </p>
  );
}
