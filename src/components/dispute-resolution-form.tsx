"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

type DisputeResolutionState = { error: string | null; message: string | null };

export function DisputeResolutionForm({
  action,
  myId,
  opponentId,
  opponentUsername,
  lang = "en",
}: {
  action: (prevState: DisputeResolutionState, formData: FormData) => Promise<DisputeResolutionState>;
  myId: string;
  opponentId: string;
  opponentUsername: string;
  lang?: Lang;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null, message: null });

  return (
    <div className="mt-2 flex flex-col gap-1.5 text-xs">
      <p className="text-muted-foreground">
        {tr(lang, {
          en: `Agree on who won this game and it resolves right away. No mod needed.`,
          es: `Pónganse de acuerdo en quién ganó este juego y se resuelve al instante. Sin esperar a un mod.`,
          ja: "この試合の勝者について合意すれば、その場で解決します。モデレーターは不要です。",
        })}
      </p>
      <form action={formAction} className="flex gap-2">
        <Button type="submit" name="winnerId" value={myId} size="sm" variant="outline" disabled={isPending}>
          {tr(lang, { en: "I won", es: "Gané yo", ja: "自分の勝ち" })}
        </Button>
        <Button type="submit" name="winnerId" value={opponentId} size="sm" variant="outline" disabled={isPending}>
          {tr(lang, { en: `${opponentUsername} won`, es: `Ganó ${opponentUsername}`, ja: `${opponentUsername}の勝ち` })}
        </Button>
      </form>
      {state.error && <p className="text-destructive">{state.error}</p>}
      {state.message && <p className="text-muted-foreground">{state.message}</p>}
    </div>
  );
}
