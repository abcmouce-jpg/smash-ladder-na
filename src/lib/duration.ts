import type { Lang } from "@/lib/i18n";

/**
 * A wait, written the way the copy around it reads: "2½ minutes", "5 minutes",
 * "90 seconds".
 *
 * Exists so the settings copy and the lobby copy can both be generated from
 * the constant the matcher actually uses (GAP_WIDEN_INTERVAL_MS) instead of
 * spelling the number out twice and drifting from it the next time it moves.
 */
export function formatInterval(ms: number, lang: Lang): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return lang === "es" ? `${seconds} segundos` : `${seconds} seconds`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (rest === 0) {
    if (lang === "es") return minutes === 1 ? "minuto" : `${minutes} minutos`;
    return minutes === 1 ? "minute" : `${minutes} minutes`;
  }
  if (rest === 30) {
    if (lang === "es") return `${minutes} minutos y medio`;
    return `${minutes}½ minutes`;
  }
  if (lang === "es") return `${minutes} min ${rest} s`;
  return `${minutes} min ${rest} s`;
}
