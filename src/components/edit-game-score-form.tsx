"use client";

import { useRef } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";

type ActionState = { error: string | null };
type BoundAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

function GameRow({
  gameNumber,
  winnerLabel,
  player1Username,
  player2Username,
  setPlayer1Action,
  clearAction,
  setPlayer2Action,
}: {
  gameNumber: number;
  winnerLabel: string;
  player1Username: string;
  player2Username: string;
  setPlayer1Action: BoundAction;
  clearAction: BoundAction;
  setPlayer2Action: BoundAction;
}) {
  const [s1, a1, pending1] = useActionState(setPlayer1Action, { error: null });
  const [s2, a2, pending2] = useActionState(clearAction, { error: null });
  const [s3, a3, pending3] = useActionState(setPlayer2Action, { error: null });
  const error = s1.error ?? s2.error ?? s3.error;
  const pending = pending1 || pending2 || pending3;
  const [confirm, confirmDialog] = useConfirm();
  const confirmReadyRef = useRef(false);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 text-muted-foreground">Game {gameNumber}</span>
      <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{winnerLabel}</span>
      <form action={a1}>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {player1Username} won
        </Button>
      </form>
      <form
        action={a2}
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
          confirm(`Clear game ${gameNumber}'s result?`).then((ok) => {
            if (ok) {
              confirmReadyRef.current = true;
              form.requestSubmit();
            }
          });
        }}
      >
        <Button type="submit" size="sm" variant="ghost" disabled={pending}>
          Clear
        </Button>
      </form>
      {confirmDialog}
      <form action={a3}>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {player2Username} won
        </Button>
      </form>
      {error && <p className="w-full text-destructive">{error}</p>}
    </div>
  );
}

export function EditGameScoreForm({
  player1Username,
  player2Username,
  games,
  resetAction,
  // Reset (wipe to 0-0) only makes sense for a set still in progress — a
  // CONFIRMED match should go through the per-game "won" buttons instead,
  // which reverse and reapply Elo automatically (capped, see editsRemaining).
  showResetButton = true,
  editsRemaining,
}: {
  player1Username: string;
  player2Username: string;
  games: {
    gameNumber: number;
    winnerUsername: string | null;
    setPlayer1Action: BoundAction;
    clearAction: BoundAction;
    setPlayer2Action: BoundAction;
  }[];
  // Must already be a bound Server Action — same reasoning as
  // ForceConfirmMatchForm's actionForPlayer1/2 props.
  resetAction: BoundAction;
  showResetButton?: boolean;
  editsRemaining?: number;
}) {
  const [resetState, resetFormAction, resetPending] = useActionState(resetAction, { error: null });
  const [confirm, confirmDialog] = useConfirm();
  const resetReadyRef = useRef(false);

  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        Edit score
        {editsRemaining !== undefined && ` (${editsRemaining} admin edit${editsRemaining === 1 ? "" : "s"} left)`}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {games.map((g) => (
          <GameRow
            key={g.gameNumber}
            gameNumber={g.gameNumber}
            winnerLabel={g.winnerUsername ?? "undecided"}
            player1Username={player1Username}
            player2Username={player2Username}
            setPlayer1Action={g.setPlayer1Action}
            clearAction={g.clearAction}
            setPlayer2Action={g.setPlayer2Action}
          />
        ))}
        {showResetButton && (
          <form
            action={resetFormAction}
            onSubmit={(e) => {
              if (resetReadyRef.current) {
                resetReadyRef.current = false;
                return;
              }
              e.preventDefault();
              // Captured now, not read off `e` in the .then() below — React nulls
              // out a SyntheticEvent's currentTarget once the synchronous handler
              // dispatch finishes, and confirm() resolves asynchronously.
              const form = e.currentTarget;
              confirm("Wipe this set's games entirely and restart from 0-0? This can't be undone.").then((ok) => {
                if (ok) {
                  resetReadyRef.current = true;
                  form.requestSubmit();
                }
              });
            }}
          >
            <Button type="submit" size="sm" variant="destructive" disabled={resetPending}>
              Reset set to 0-0
            </Button>
          </form>
        )}
        {resetState.error && <p className="text-destructive">{resetState.error}</p>}
      </div>
      {confirmDialog}
    </details>
  );
}
