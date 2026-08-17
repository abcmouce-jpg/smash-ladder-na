import { PROVISIONAL_MIN_GAMES, RANK_TIERS, rankTierRatingRange, type RankTier } from "@/lib/rank-tier";
import { TierBadge } from "@/components/rank-badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// One row of the rank list: the real badge, the window it covers, and the
// blurb. The range is passed in rather than derived here because the
// provisional row is gated on sets played, not rating — it is the absence
// of a tier, which is why it is not a member of RANK_TIERS and why `tier`
// is nullable.
function RankRow({ tier, range, children }: { tier: RankTier | null; range: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <TierBadge tier={tier} />
        <span className="text-xs tabular-nums text-muted-foreground">{range}</span>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

// Spanish blurbs, keyed off the same tier.name used in RANK_TIERS — kept
// here rather than on the data model so lib/rank-tier.ts (used by matching/
// admin logic too) stays a single canonical English source of truth.
const TIER_DESCRIPTIONS_ES: Record<string, string> = {
  Legend: "La cima absoluta de la liga. Reservado para quienes definen el meta en lo más alto.",
  Grandmaster: "La cima de la liga. Solo un puñado de jugadores vence consistentemente al nivel Master.",
  Master:
    "Vence consistentemente a jugadores Elite, con opciones reales de terminar entre los 5 primeros al final de la temporada.",
  Elite: "Muy por encima de la clasificación inicial, con un historial de victorias probado frente al resto.",
  Fighter: "La banda donde se ubica la clasificación inicial de 1500, y donde aterriza la mayoría al estabilizarse.",
  Challenger:
    "Por debajo de la clasificación inicial. Todos los rangos superiores son alcanzables desde aquí, y las clasificaciones se reinician al terminar la temporada.",
};

// Every rank a player can hold, highest first, rendered straight off
// RANK_TIERS so a new tier needs no edit here. Deliberately free of any
// heading, dialog, or page markup: whichever surface shows the list owns its
// own framing and its own outer spacing, which is what the className
// pass-through is for.
export function RankTierList({ className, lang = "en" }: { className?: string; lang?: "en" | "es" }) {
  return (
    <Card className={cn("divide-y divide-border overflow-hidden py-0", className)}>
      {RANK_TIERS.map((tier) => (
        <RankRow key={tier.name} tier={tier} range={rankTierRatingRange(tier)}>
          {lang === "es" ? TIER_DESCRIPTIONS_ES[tier.name] : tier.description}
        </RankRow>
      ))}
      <RankRow
        tier={null}
        range={lang === "es" ? `Primeras ${PROVISIONAL_MIN_GAMES} partidas` : `First ${PROVISIONAL_MIN_GAMES} sets`}
      >
        {lang === "es"
          ? "Aún sin rango. La clasificación varía más en tus primeras partidas, así que la insignia se mantiene neutral hasta que se estabilice."
          : "No rank yet. Ratings swing hardest over your first few sets, so the badge stays neutral until yours has had a chance to settle."}
      </RankRow>
    </Card>
  );
}
