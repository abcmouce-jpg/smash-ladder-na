import { Rocket } from "lucide-react";
import { hasPreSeasonStarted } from "@/lib/seasons";

const LAUNCH_LABEL = "Saturday, July 25 at 6:00 PM ET";

// Server-rendered so it disappears on its own once launch passes, without
// anyone needing to remember to remove it.
export function PreSeasonBanner() {
  if (hasPreSeasonStarted()) return null;

  return (
    <div className="border-b border-border bg-primary/5">
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-6 py-2 text-sm">
        <Rocket className="size-3.5 shrink-0 text-primary" />
        <span className="text-muted-foreground">
          Pre-season hasn&apos;t started yet — launches {LAUNCH_LABEL}
        </span>
      </div>
    </div>
  );
}
