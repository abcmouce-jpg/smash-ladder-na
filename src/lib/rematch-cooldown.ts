// Self-declared minimum time before the same two players can be paired
// again. null means anytime (the default, to not shrink an already-small
// pool). Same both-sides-must-cover-it logic as match distance/rating gap:
// matching requires the time since these two last played to clear BOTH
// sides' chosen cooldown, not just whoever queues second.
//
// WARNING: removing or renumbering a value here orphans anyone already
// storing it — see the equivalent warning on MATCH_DISTANCE_PRESETS in
// regions.ts. Any future change MUST ship with a migration for existing
// stored values.
import type { Lang } from "@/lib/lang";

export const REMATCH_COOLDOWN_PRESETS: readonly { label: Record<Lang, string>; hours: number | null }[] = [
  {
    label: { en: "Rematches allowed anytime", es: "Revanchas en cualquier momento", ja: "いつでも再戦可" },
    hours: null,
  },
  { label: { en: "Wait 24 hours", es: "Esperar 24 horas", ja: "24時間あける" }, hours: 24 },
  { label: { en: "Wait 12 hours", es: "Esperar 12 horas", ja: "12時間あける" }, hours: 12 },
  { label: { en: "Wait 6 hours", es: "Esperar 6 horas", ja: "6時間あける" }, hours: 6 },
  { label: { en: "Wait 3 hours", es: "Esperar 3 horas", ja: "3時間あける" }, hours: 3 },
  { label: { en: "Wait 1 hour", es: "Esperar 1 hora", ja: "1時間あける" }, hours: 1 },
];

export const MAX_REMATCH_COOLDOWN_HOURS = Math.max(...REMATCH_COOLDOWN_PRESETS.map((preset) => preset.hours ?? 0));

export function rematchCooldownAllows(
  lastMatchAt: Date | undefined,
  cooldownHoursA: number | null,
  cooldownHoursB: number | null,
) {
  if (!lastMatchAt) return true;
  const requiredHours = Math.max(cooldownHoursA ?? 0, cooldownHoursB ?? 0);
  if (requiredHours <= 0) return true;
  const elapsedHours = (Date.now() - lastMatchAt.getTime()) / (60 * 60 * 1000);
  return elapsedHours >= requiredHours;
}
