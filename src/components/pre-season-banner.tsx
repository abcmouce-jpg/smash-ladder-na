"use client";

import { useEffect, useState } from "react";
import { Rocket } from "lucide-react";

const LAUNCH_LABEL = "Saturday, July 25 at 6:00 PM ET";

function formatCountdown(msRemaining: number) {
  const totalMinutes = Math.floor(msRemaining / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

// Rendered client-side only (starts as null) so the countdown reflects the
// viewer's own clock rather than whatever was true when the page was last
// built or cached, and so it can disappear on its own once launch passes
// without anyone needing to remember to remove it.
export function PreSeasonBanner({ startsAt }: { startsAt: string }) {
  const [msRemaining, setMsRemaining] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(startsAt).getTime();
    const tick = () => setMsRemaining(target - Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [startsAt]);

  if (msRemaining === null || msRemaining <= 0) return null;

  return (
    <div className="border-b border-border bg-primary/5">
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-6 py-2 text-sm">
        <Rocket className="size-3.5 shrink-0 text-primary" />
        <span className="text-muted-foreground">
          Pre-season hasn&apos;t started yet — launches {LAUNCH_LABEL}
        </span>
        <span className="ml-auto shrink-0 font-medium tabular-nums text-primary">
          {formatCountdown(msRemaining)}
        </span>
      </div>
    </div>
  );
}
