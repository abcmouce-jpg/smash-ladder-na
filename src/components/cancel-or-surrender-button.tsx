"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

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
  lang?: Lang;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null });
  const [confirm, confirmDialog, closeConfirm] = useConfirm();
  const confirmReadyRef = useRef(false);
  const prevModeRef = useRef(mode);

  // The lobby poller refreshes the page every few seconds, which can flip
  // `mode` (opponent went from not-shown-up to engaged) while the confirm
  // dialog is already open showing the old copy — see confirm-dialog.tsx's
  // `close`. Dismiss it so a stale "free cancel" prompt can't be confirmed
  // into what the server will now correctly reject as a surrender.
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      closeConfirm();
    }
    prevModeRef.current = mode;
  }, [mode, closeConfirm]);

  const cancelReadyAtMs = mode === "cancel" && cancelReadyAt ? new Date(cancelReadyAt).getTime() : null;
  const [secondsLeft, setSecondsLeft] = useState(() => (cancelReadyAtMs ? secondsUntil(cancelReadyAtMs) : 0));

  useEffect(() => {
    if (!cancelReadyAtMs) return;
    const id = setInterval(() => setSecondsLeft(secondsUntil(cancelReadyAtMs)), 1000);
    return () => clearInterval(id);
  }, [cancelReadyAtMs]);

  const waitingForGracePeriod = !!cancelReadyAtMs && secondsLeft > 0;

  const confirmMessage =
    mode === "surrender"
      ? tr(lang, {
          en: "Surrender this match? It counts as a loss and affects your rating. This can't be undone.",
          es: "¿Rendirte? Cuenta como derrota y afecta tu clasificación. No se puede deshacer.",
          ja: "この試合を降参しますか？敗北として扱われ、レートに影響します。取り消せません。",
        })
      : tr(lang, {
          en: "Cancel this match? This can't be undone.",
          es: "¿Cancelar esta partida? No se puede deshacer.",
          ja: "この試合を中止しますか？取り消せません。",
        });

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
          confirm(confirmMessage, { cancelLabel: tr(lang, { en: "Go back", es: "Volver", ja: "戻る" }) }).then((ok) => {
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
              {tr(lang, {
                en: `Cancel in ${secondsLeft}s`,
                es: `Cancelar en ${secondsLeft}s`,
                ja: `${secondsLeft}秒後に中止`,
              })}
            </span>
          ) : mode === "surrender" ? (
            tr(lang, {
              en: "Surrender (counts as a loss)",
              es: "Rendirse (cuenta como derrota)",
              ja: "降参する（敗北扱い）",
            })
          ) : (
            tr(lang, { en: "Cancel match", es: "Cancelar partida", ja: "試合を中止する" })
          )}
        </Button>
      </form>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      {confirmDialog}
    </div>
  );
}
