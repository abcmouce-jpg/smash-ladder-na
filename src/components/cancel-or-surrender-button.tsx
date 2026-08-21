"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";

type ActionState = { error: string | null };

function secondsUntil(deadlineMs: number) {
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
}

// Same button, two very different consequences depending on whether the
// opponent has engaged yet (see hasOpponentEngaged in lib/matches.ts) — the
// label, confirm copy, and button color all change so it's never ambiguous
// which one you're about to click. "cancel" is free (the opponent hasn't
// shown up); "surrender" counts as an actual loss.
export function CancelOrSurrenderButton({
  mode,
  action,
  cancelReadyAt,
  lang = "en",
}: {
  mode: "cancel" | "surrender";
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  // Only meaningful for mode === "cancel" — see CANCEL_GRACE_PERIOD_SECONDS
  // in lib/matches.ts. Ignored for "surrender", which has no grace period.
  cancelReadyAt?: string;
  lang?: "en" | "es";
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null });
  const [confirm, confirmDialog] = useConfirm();
  const confirmReadyRef = useRef(false);

  const cancelReadyAtMs = mode === "cancel" && cancelReadyAt ? new Date(cancelReadyAt).getTime() : null;
  const [secondsLeft, setSecondsLeft] = useState(() => (cancelReadyAtMs ? secondsUntil(cancelReadyAtMs) : 0));

  useEffect(() => {
    if (!cancelReadyAtMs) return;
    const id = setInterval(() => setSecondsLeft(secondsUntil(cancelReadyAtMs)), 1000);
    return () => clearInterval(id);
  }, [cancelReadyAtMs]);

  const waitingForGracePeriod = !!cancelReadyAtMs && secondsLeft > 0;

  const confirmMessage =
    lang === "es"
      ? mode === "surrender"
        ? "¿Rendirte en esta partida? Tu rival ya empezó, así que esto cuenta como derrota y afectará tu clasificación. Esto no se puede deshacer."
        : "¿Cancelar esta partida? Esto no se puede deshacer."
      : mode === "surrender"
        ? "Surrender this match? Your opponent has already started, so this counts as a loss and will affect your rating. This can't be undone."
        : "Cancel this match? This can't be undone.";

  return (
    <div className="flex flex-col items-end gap-1">
      <form
        action={formAction}
        onSubmit={(e) => {
          if (confirmReadyRef.current) {
            confirmReadyRef.current = false;
            return;
          }
          e.preventDefault();
          // Captured now, not read off `e` in the .then() below — React nulls
          // out a SyntheticEvent's currentTarget once the synchronous handler
          // dispatch finishes, and confirm() resolves asynchronously.
          const form = e.currentTarget;
          confirm(confirmMessage, { cancelLabel: lang === "es" ? "Volver" : "Go back" }).then((ok) => {
            if (ok) {
              confirmReadyRef.current = true;
              form.requestSubmit();
            }
          });
        }}
      >
        <Button type="submit" variant="destructive" size="sm" disabled={isPending || waitingForGracePeriod}>
          {waitingForGracePeriod ? (
            <span suppressHydrationWarning>
              {lang === "es" ? `Cancelar en ${secondsLeft}s` : `Cancel in ${secondsLeft}s`}
            </span>
          ) : lang === "es" ? (
            mode === "surrender" ? (
              "Rendirse (cuenta como derrota)"
            ) : (
              "Cancelar partida"
            )
          ) : mode === "surrender" ? (
            "Surrender (counts as a loss)"
          ) : (
            "Cancel match"
          )}
        </Button>
      </form>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      {confirmDialog}
    </div>
  );
}
