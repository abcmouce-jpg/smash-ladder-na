import type { WinRateRow } from "@/lib/player-analytics";
import type { Lang } from "@/lib/i18n";

// Minimum sample size before a win rate is shown on its own bar — a 1-0
// record reading as "100%" is noise, not signal. Rows below this still
// count toward nothing being hidden (see the empty-state check below);
// they just don't get a misleadingly confident bar.
const MIN_GAMES_FOR_RATE = 3;

export function WinRateBars({ rows, lang, emptyMessage }: { rows: WinRateRow[]; lang: Lang; emptyMessage: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const enoughSample = row.total >= MIN_GAMES_FOR_RATE;
        return (
          <li key={row.label} className="flex items-center gap-3 text-sm">
            <span className="w-32 shrink-0 truncate">{row.label}</span>
            <span className="relative h-4 flex-1 overflow-hidden rounded-r-[4px] bg-muted">
              {enoughSample && (
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px] bg-primary"
                  style={{ width: `${Math.round(row.winRate * 100)}%` }}
                />
              )}
            </span>
            <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">
              {enoughSample
                ? `${Math.round(row.winRate * 100)}% (${row.wins}-${row.losses})`
                : lang === "es"
                  ? `${row.wins}-${row.losses} (pocas)`
                  : `${row.wins}-${row.losses} (few)`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
