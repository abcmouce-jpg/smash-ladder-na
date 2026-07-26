import { ChevronDown } from "lucide-react";
import { CharacterIcon } from "@/components/character-icon";
import { Badge } from "@/components/ui/badge";
import type { CharacterUsage } from "@/lib/players";

function winRateVariant(winRate: number): "success" | "warning" | "destructive" {
  if (winRate >= 55) return "success";
  if (winRate >= 45) return "warning";
  return "destructive";
}

export function CharacterUsageCard({
  usage,
  mainCharacter,
}: {
  usage: CharacterUsage[];
  mainCharacter: string | null;
}) {
  if (usage.length === 0) return null;

  return (
    <details className="group mt-4 rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-medium">Character Usage</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="max-h-80 divide-y divide-border overflow-y-auto border-t border-border">
        {usage.map((u) => (
          <div key={u.character} className="flex items-center gap-3 px-4 py-2.5">
            <CharacterIcon name={u.character} size={24} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{u.character}</span>
                {u.character === mainCharacter && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    Main
                  </Badge>
                )}
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${u.usagePercent}%` }}
                />
              </div>
            </div>
            <div className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              <div>
                {u.usagePercent}% · {u.games} game{u.games === 1 ? "" : "s"}
              </div>
              <div className="mt-0.5 flex items-center justify-end gap-1">
                <span>
                  {u.wins}W–{u.losses}L
                </span>
                <Badge variant={winRateVariant(u.winRate)} className="px-1.5 py-0">
                  {u.winRate}%
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
