"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { seasonTimeRemaining } from "@/lib/season-countdown";

const pad = (n: number) => String(n).padStart(2, "0");

// Ticks client-side only, same hydration approach as SeasonCountdown. Renders
// nothing once the deadline passes — the cron rolls the season over within a
// few minutes of it, at which point the server-side gate in the parent
// (season-ending-banner.tsx) stops rendering this at all on the next request.
export function SeasonEndingBannerClient({ endsAt, seasonName }: { endsAt: string; seasonName: string }) {
  const endsAtMs = new Date(endsAt).getTime();
  const [remaining, setRemaining] = useState(() => seasonTimeRemaining(endsAtMs));

  useEffect(() => {
    const id = setInterval(() => setRemaining(seasonTimeRemaining(endsAtMs)), 1000);
    return () => clearInterval(id);
  }, [endsAtMs]);

  const totalSeconds = remaining.minutes * 60 + remaining.seconds;
  if (totalSeconds <= 0) {
    return (
      <div className="border-b border-border bg-destructive/10">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-2 text-sm">
          <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
          <span className="text-muted-foreground">{seasonName} is wrapping up — hang tight for the new season.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border bg-destructive/10">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-2 text-sm">
        <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
        <span className="text-muted-foreground">
          {seasonName} ends in{" "}
          <span className="font-semibold tabular-nums text-foreground" suppressHydrationWarning>
            {pad(remaining.minutes)}:{pad(remaining.seconds)}
          </span>{" "}
          — all unresolved matches will be cancelled.
        </span>
      </div>
    </div>
  );
}
