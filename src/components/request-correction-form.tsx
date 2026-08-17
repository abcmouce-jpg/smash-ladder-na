"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

type CorrectionState = { error: string | null; message: string | null };

export function RequestCorrectionForm({
  action,
  myId,
  opponentId,
  opponentUsername,
  lang = "en",
}: {
  action: (prevState: CorrectionState, formData: FormData) => Promise<CorrectionState>;
  myId: string;
  opponentId: string;
  opponentUsername: string;
  lang?: "en" | "es";
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null, message: null });

  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        {lang === "es" ? "¿Resultado incorrecto?" : "Wrong result?"}
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">
        <p className="text-muted-foreground">
          {lang === "es" ? (
            <>
              Solo funciona mientras esta siga siendo la partida confirmada más reciente de ambos. Si tu elección no
              coincide con la de {opponentUsername}, un mod la revisa en su lugar.
            </>
          ) : (
            <>
              Only works while this is still both of your most recent confirmed match. If your pick doesn&apos;t match{" "}
              {opponentUsername}&apos;s, a mod reviews it instead.
            </>
          )}
        </p>
        <form action={formAction} className="flex gap-2">
          <Button type="submit" name="winnerId" value={myId} size="sm" variant="outline" disabled={isPending}>
            {lang === "es" ? "Yo gané en realidad" : "I actually won"}
          </Button>
          <Button type="submit" name="winnerId" value={opponentId} size="sm" variant="outline" disabled={isPending}>
            {lang === "es" ? `${opponentUsername} ganó en realidad` : `${opponentUsername} actually won`}
          </Button>
        </form>
        {state.error && <p className="text-destructive">{state.error}</p>}
        {state.message && <p className="text-muted-foreground">{state.message}</p>}
      </div>
    </details>
  );
}
