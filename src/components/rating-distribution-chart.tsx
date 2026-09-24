import { getRankTier, PROVISIONAL_GAMES_THRESHOLD } from "@/lib/rank-tier";
import type { RatingBucket } from "@/lib/public-stats";
import type { Lang } from "@/lib/i18n";

// Histogram of every ranked player's current rating, as a bar per rating bin
// (see getRatingDistribution). Presentational and server-safe, like
// MatchesByHourChart — hover detail rides on the title attribute and the same
// numbers are exposed as a table, since this is a static community-stats block
// rather than something that needs chart interactions.
export function RatingDistributionChart({
  buckets,
  total,
  average,
  median,
  lang,
}: {
  buckets: RatingBucket[];
  total: number;
  average: number;
  median: number;
  lang: Lang;
}) {
  if (total === 0 || buckets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "es"
          ? "Aún no hay suficientes jugadores clasificados para trazar una distribución."
          : "Not enough ranked players to chart a distribution yet."}
      </p>
    );
  }

  const max = Math.max(...buckets.map((b) => b.count));
  // Roughly seven labels along the axis — enough to read the scale without the
  // numbers colliding on narrow viewports.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 7));

  const playerLabel = (count: number) =>
    lang === "es"
      ? `${count} ${count === 1 ? "jugador" : "jugadores"}`
      : `${count} ${count === 1 ? "player" : "players"}`;
  const rangeLabel = (b: RatingBucket) => `${b.min}–${b.max}`;
  // A bucket's whole range sits inside one tier — bin edges and tier floors are
  // both multiples of 25 — so the tier of its lower bound describes it fully.
  const tierName = (b: RatingBucket) => getRankTier(b.min, PROVISIONAL_GAMES_THRESHOLD)?.name ?? "Provisional";

  return (
    <div>
      <div
        role="img"
        aria-label={lang === "es" ? "Distribución de clasificación de los jugadores" : "Distribution of player ratings"}
      >
        <div className="flex h-40 items-end gap-px">
          {buckets.map((b) => {
            // A zero-count bucket renders as nothing — a minimum sliver would
            // invent players where the ladder has none.
            const pct = b.count === 0 ? 0 : Math.max(2, Math.round((b.count / max) * 100));
            return (
              <div
                key={b.min}
                title={`${rangeLabel(b)} — ${playerLabel(b.count)} (${tierName(b)})`}
                className="flex h-full flex-1 flex-col justify-end"
              >
                <div className="w-full rounded-t-sm bg-primary" style={{ height: `${pct}%` }} />
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-px text-[9px] text-muted-foreground tabular-nums">
          {buckets.map((b, i) => (
            <div key={b.min} className="flex-1 text-center">
              {i % labelEvery === 0 ? b.min : ""}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground tabular-nums">
        {lang === "es"
          ? `${total} jugadores clasificados — mediana ${median}, promedio ${average}`
          : `${total} ranked players — median ${median}, average ${average}`}
      </p>

      {/* Hover titles are undiscoverable on touch devices, which is what this
          table fallback is for. */}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          {lang === "es" ? "Ver como tabla" : "View as table"}
        </summary>
        <div className="mt-2 max-h-40 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 font-medium">{lang === "es" ? "Clasificación" : "Rating"}</th>
                <th className="py-1 font-medium">{lang === "es" ? "Rango" : "Rank"}</th>
                <th className="py-1 text-right font-medium tabular-nums">{lang === "es" ? "Jugadores" : "Players"}</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.min} className="border-t border-border/60">
                  <td className="py-1 tabular-nums">{rangeLabel(b)}</td>
                  <td className="py-1 text-muted-foreground">{tierName(b)}</td>
                  <td className="py-1 text-right tabular-nums">{b.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
