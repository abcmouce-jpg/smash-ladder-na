"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

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
          if (!confirm(`Clear game ${gameNumber}'s result?`)) e.preventDefault();
        }}
      >
        <Button type="submit" size="sm" variant="ghost" disabled={pending}>
          Clear
        </Button>
      </form>
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
}) {
  const [resetState, resetFormAction, resetPending] = useActionState(resetAction, { error: null });

  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        Edit score
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
        <form
          action={resetFormAction}
          onSubmit={(e) => {
            if (!confirm("Wipe this set's games entirely and restart from 0-0? This can't be undone.")) {
              e.preventDefault();
            }
          }}
        >
          <Button type="submit" size="sm" variant="destructive" disabled={resetPending}>
            Reset set to 0-0
          </Button>
        </form>
        {resetState.error && <p className="text-destructive">{resetState.error}</p>}
      </div>
    </details>
  );
}
