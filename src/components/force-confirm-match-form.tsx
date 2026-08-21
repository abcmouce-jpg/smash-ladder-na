"use client";

import { useRef } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";

type ForceConfirmState = { error: string | null };

type ForceConfirmAction = (prevState: ForceConfirmState, formData: FormData) => Promise<ForceConfirmState>;

export function ForceConfirmMatchForm({
  player1Username,
  player2Username,
  actionForPlayer1,
  actionForPlayer2,
}: {
  player1Username: string;
  player2Username: string;
  // Must already be bound Server Actions — a plain closure built in a
  // parent Server Component can't be passed as a prop to a Client Component.
  actionForPlayer1: ForceConfirmAction;
  actionForPlayer2: ForceConfirmAction;
}) {
  const [state1, formAction1, isPending1] = useActionState(actionForPlayer1, { error: null });
  const [state2, formAction2, isPending2] = useActionState(actionForPlayer2, { error: null });
  const error = state1.error ?? state2.error;
  const pending = isPending1 || isPending2;
  const [confirm, confirmDialog] = useConfirm();
  const confirmReadyRef = useRef(false);

  function confirmAndSubmit(e: React.FormEvent<HTMLFormElement>, winnerUsername: string) {
    if (confirmReadyRef.current) {
      confirmReadyRef.current = false;
      return;
    }
    e.preventDefault();
    // Captured now, not read off `e` in the .then() below — React nulls
    // out a SyntheticEvent's currentTarget once the synchronous handler
    // dispatch finishes, and confirm() resolves asynchronously.
    const form = e.currentTarget;
    confirm(`Close out this set with ${winnerUsername} as the winner? This applies rating immediately.`).then((ok) => {
      if (ok) {
        confirmReadyRef.current = true;
        form.requestSubmit();
      }
    });
  }

  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        Force result (nobody reporting)
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">
        <div className="flex gap-2">
          <form action={formAction1} onSubmit={(e) => confirmAndSubmit(e, player1Username)}>
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {player1Username} won
            </Button>
          </form>
          <form action={formAction2} onSubmit={(e) => confirmAndSubmit(e, player2Username)}>
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {player2Username} won
            </Button>
          </form>
        </div>
        {error && <p className="text-destructive">{error}</p>}
      </div>
      {confirmDialog}
    </details>
  );
}
