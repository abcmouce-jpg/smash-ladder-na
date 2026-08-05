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
export const REMATCH_COOLDOWN_PRESETS = [
  { label: "Wait 24 hours", hours: 24 },
  { label: "Wait 12 hours", hours: 12 },
  { label: "Wait 6 hours", hours: 6 },
  { label: "Wait 3 hours", hours: 3 },
  { label: "Wait 1 hour", hours: 1 },
  { label: "Rematches allowed anytime", hours: null },
] as const;

export const MAX_REMATCH_COOLDOWN_HOURS = Math.max(
  ...REMATCH_COOLDOWN_PRESETS.map((preset) => preset.hours ?? 0),
);

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
