"use client";

import { useEffect, useState } from "react";
import { isSeasonTimeUp, seasonTimeRemaining } from "@/lib/season-countdown";
import type { Lang } from "@/lib/i18n";

const UNITS = ["days", "hours", "minutes", "seconds"] as const;

const UNIT_LABELS: Record<Lang, Record<(typeof UNITS)[number], string>> = {
  en: { days: "Days", hours: "Hours", minutes: "Min", seconds: "Sec" },
  es: { days: "Días", hours: "Horas", minutes: "Min", seconds: "Seg" },
};

// Ticks client-side only; the server renders whatever the first render
// computed and suppressHydrationWarning absorbs the one-paint clock
// difference, same reason as Countdown and LocalTime.
export function SeasonCountdown({ endsAt, lang }: { endsAt: string; lang: Lang }) {
  const endsAtMs = new Date(endsAt).getTime();
  const [remaining, setRemaining] = useState(() => seasonTimeRemaining(endsAtMs));

  useEffect(() => {
    const id = setInterval(() => setRemaining(seasonTimeRemaining(endsAtMs)), 1000);
    return () => clearInterval(id);
  }, [endsAtMs]);

  // Reaching zero doesn't end the season — the rollover is manual, and for the
  // preseason this date is only an estimate — so say "wrapping up" rather than
  // leaving a row of dead zeroes sitting there.
  if (isSeasonTimeUp(remaining)) {
    return (
      <span className="text-xs text-muted-foreground">
        {lang === "es" ? "Cerrando la temporada…" : "Wrapping up the season…"}
      </span>
    );
  }

  return (
    <div className="flex items-end gap-3">
      {UNITS.map((unit) => (
        <div key={unit} className="flex flex-col items-center gap-0.5">
          <span className="text-lg leading-none font-semibold tabular-nums" suppressHydrationWarning>
            {String(remaining[unit]).padStart(2, "0")}
          </span>
          <span className="text-[10px] tracking-wide text-muted-foreground uppercase">{UNIT_LABELS[lang][unit]}</span>
        </div>
      ))}
    </div>
  );
}
