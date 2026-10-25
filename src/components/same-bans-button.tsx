"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsTouchDevice } from "@/hooks/use-is-touch-device";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

export function SameBansButton({
  action,
  gameNumber,
  stages,
  canAct,
  lang = "en",
}: {
  action: ComponentProps<"form">["action"];
  gameNumber: number;
  stages: string[];
  canAct: boolean;
  lang?: Lang;
}) {
  const isTouch = useIsTouchDevice();
  const stagesText = stages.join(", ");

  const button = (
    <Button type="submit" size="sm" variant="default" disabled={!canAct}>
      {tr(lang, {
        en: `Same bans as Game ${gameNumber}`,
        es: `Mismos bans que el juego ${gameNumber}`,
        ja: `第${gameNumber}試合と同じBAN`,
      })}
    </Button>
  );

  return (
    <form action={action}>
      {isTouch ? (
        // A hover tooltip doesn't work here: this is a real submit button, so
        // a tap both fires the strike action and (if it toggled a tooltip)
        // would race with the page navigating away — there's no way to
        // "preview" the bans before committing. Show them as plain text
        // instead.
        <div className="space-y-1">
          {button}
          <p className="text-xs text-muted-foreground">{stagesText}</p>
        </div>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{stagesText}</TooltipContent>
        </Tooltip>
      )}
    </form>
  );
}
