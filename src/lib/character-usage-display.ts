import type { CharacterUsage } from "./players";

const SECONDARY_ICON_COUNT = 3;

// A secondary only earns its own inline icon once it's a real fraction of
// this player's games — otherwise a couple of off-character picks (well
// under a third of their sets) would sit next to main as if they were a
// serious co-main. Doesn't apply to main itself, which is always shown
// (it's whichever character was played most, by definition).
const SECONDARY_MIN_USAGE_PERCENT = 30;

export interface CharacterUsageDisplay {
  main: CharacterUsage | null;
  secondary: CharacterUsage[];
  overflow: CharacterUsage[];
}

// usagePercent is rounded, so a character played only a game or two out of
// hundreds can round down to 0 — but it's in this list precisely because
// games > 0, so "0%" would misleadingly read as "never played."
export function formatUsagePercent(usagePercent: number): string {
  return usagePercent === 0 ? "<1%" : `${usagePercent}%`;
}

// Slices a player's ranked character usage into what CharacterUsageIcons
// renders inline (main + up to 3 next-most-played, each at least
// SECONDARY_MIN_USAGE_PERCENT) versus what folds into the overflow tooltip,
// so a player who's played many characters doesn't turn every row that
// shows them into a wall of tiny icons — and a character barely played
// doesn't get an inline icon just because it happened to rank in the top 4.
export function groupCharacterUsageForDisplay(usage: CharacterUsage[]): CharacterUsageDisplay {
  const main = usage[0] ?? null;
  const secondary: CharacterUsage[] = [];
  const overflow: CharacterUsage[] = [];
  for (const u of usage.slice(1)) {
    if (secondary.length < SECONDARY_ICON_COUNT && u.usagePercent >= SECONDARY_MIN_USAGE_PERCENT) {
      secondary.push(u);
    } else {
      overflow.push(u);
    }
  }
  return { main, secondary, overflow };
}
