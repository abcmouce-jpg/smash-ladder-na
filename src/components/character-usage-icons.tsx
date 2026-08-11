import { MoreHorizontal } from "lucide-react";
import { CharacterIcon } from "@/components/character-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatUsagePercent, groupCharacterUsageForDisplay } from "@/lib/character-usage-display";
import type { CharacterUsage } from "@/lib/players";

// Compact character-usage summary for contexts where every icon is real
// estate (leaderboard rows, the profile header) — one prominent icon for
// the most-played character, up to 3 smaller/dimmer icons for the next
// most-played, and anything past that folds into a "···" tooltip instead of
// piling up inline. See groupCharacterUsageForDisplay for the slicing rule.
export function CharacterUsageIcons({ usage }: { usage: CharacterUsage[] }) {
  const { main, secondary, overflow } = groupCharacterUsageForDisplay(usage);
  if (!main) return null;

  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <CharacterIcon name={main.character} size={20} />
      {secondary.map((u) => (
        <CharacterIcon key={u.character} name={u.character} size={16} className="opacity-60" />
      ))}
      {overflow.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex size-4 shrink-0 cursor-help items-center justify-center text-muted-foreground opacity-60 hover:opacity-100"
              aria-label={`${overflow.length} more character${overflow.length === 1 ? "" : "s"}`}
            >
              <MoreHorizontal className="size-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <ul className="flex flex-col gap-1">
              {overflow.map((u) => (
                <li key={u.character} className="flex items-center gap-1.5">
                  <CharacterIcon name={u.character} size={14} />
                  <span>
                    {u.character} · {formatUsagePercent(u.usagePercent)}
                  </span>
                </li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}
