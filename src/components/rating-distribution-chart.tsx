import { getRankTier, PROVISIONAL_GAMES_THRESHOLD } from "@/lib/rank-tier";
import type { RatingBucket } from "@/lib/public-stats";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

// Histogram of every ranked player's current rating, as a bar per rating bin
// (see getRatingDistribution). Presentational and server-safe — hover detail
// rides on the title attribute and the same numbers are exposed as a table,
// since this is a static community-stats block rather than something that
// needs chart interactions.
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
        {tr(lang, {
          en: "Not enough ranked players to chart a distribution yet.",
          es: "Aún no hay suficientes jugadores clasificados para trazar una distribución.",
          ja: "分布を表示できるだけのランク対象プレイヤーがまだいません。",
        })}
      </p>
    );
  }

  const max = Math.max(...buckets.map((b) => b.count));
  // Roughly seven labels along the axis — enough to read the scale without the
  // numbers colliding on narrow viewports.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 7));

  const playerLabel = (count: number) =>
    tr(lang, {
      en: `${count} ${count === 1 ? "player" : "players"}`,
      es: `${count} ${count === 1 ? "jugador" : "jugadores"}`,
      ja: `${count}人`,
    });
  const rangeLabel = (b: RatingBucket) => `${b.min}–${b.max}`;
  // A bucket's whole range sits inside one tier — bin edges and tier floors are
  // both multiples of 25 — so the tier of its lower bound describes it fully.
  const tierName = (b: RatingBucket) => getRankTier(b.min, PROVISIONAL_GAMES_THRESHOLD)?.name ?? "Provisional";

  return (
    <div>
      <div
        role="img"
        aria-label={tr(lang, {
          en: "Distribution of player ratings",
          es: "Distribución de clasificación de los jugadores",
          ja: "プレイヤーのレート分布",
        })}
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
        {tr(lang, {
          en: `${total} ranked players — median ${median}, average ${average}`,
          es: `${total} jugadores clasificados — mediana ${median}, promedio ${average}`,
          ja: `ランク対象プレイヤー${total}人 — 中央値 ${median}、平均 ${average}`,
        })}
      </p>

      {/* Hover titles are undiscoverable on touch devices, which is what this
          table fallback is for. */}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          {tr(lang, { en: "View as table", es: "Ver como tabla", ja: "表で見る" })}
        </summary>
        <div className="mt-2 max-h-40 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 font-medium">{tr(lang, { en: "Rating", es: "Clasificación", ja: "レート" })}</th>
                <th className="py-1 font-medium">{tr(lang, { en: "Rank", es: "Rango", ja: "ランク" })}</th>
                <th className="py-1 text-right font-medium tabular-nums">{tr(lang, { en: "Players", es: "Jugadores", ja: "人数" })}</th>
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
