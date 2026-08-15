"use client";

import { useRef } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";

type ModerationState = { error: string | null };

const SUSPENSION_DURATION_OPTIONS = [
  { label: "1 hour", value: "1" },
  { label: "24 hours", value: "24" },
  { label: "3 days", value: "72" },
  { label: "7 days", value: "168" },
  { label: "30 days", value: "720" },
  { label: "Indefinite", value: "indefinite" },
] as const;

export function ModerationStatusForm({
  action,
  currentStatus,
}: {
  action: (prevState: ModerationState, formData: FormData) => Promise<ModerationState>;
  currentStatus: "ACTIVE" | "SUSPENDED" | "BANNED";
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Moderator tools</p>
      <p className="text-xs text-muted-foreground">
        Direct action — no report or threshold required. Current status:{" "}
        <span className="font-medium">{currentStatus.toLowerCase()}</span>.
      </p>
      <form action={formAction} className="flex flex-wrap items-center gap-1.5">
        <select
          name="suspensionHours"
          defaultValue="indefinite"
          className="h-7 rounded-lg border border-border bg-background px-1.5 text-xs text-foreground outline-none focus-visible:border-ring"
        >
          {SUSPENSION_DURATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          name="customHours"
          min={1}
          placeholder="or custom hrs"
          className="h-7 w-24 rounded-lg border border-border bg-background px-1.5 text-xs text-foreground outline-none focus-visible:border-ring"
        />
        <input
          name="reason"
          placeholder="Reason (optional)"
          maxLength={1000}
          className="h-7 w-40 rounded-lg border border-border bg-transparent px-2 text-xs outline-none focus-visible:border-ring"
        />
        <Button type="submit" name="action" value="SUSPEND" size="sm" variant="secondary" disabled={isPending}>
          Suspend
        </Button>
        <Button type="submit" name="action" value="BAN" size="sm" variant="destructive" disabled={isPending}>
          Insta-ban
        </Button>
        {currentStatus !== "ACTIVE" && (
          <Button type="submit" name="action" value="REINSTATE" size="sm" variant="outline" disabled={isPending}>
            Reinstate
          </Button>
        )}
      </form>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}

type BanIpState = { error: string | null; message: string | null };

export function BanIpButton({
  action,
  ip,
}: {
  action: (prevState: BanIpState, formData: FormData) => Promise<BanIpState>;
  ip: string;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null, message: null });
  const [confirm, confirmDialog] = useConfirm();
  const confirmReadyRef = useRef(false);

  return (
    <div className="flex flex-col gap-1">
      <form
        action={formAction}
        onSubmit={(e) => {
          if (confirmReadyRef.current) {
            confirmReadyRef.current = false;
            return;
          }
          e.preventDefault();
          confirm(`Ban IP ${ip}? This blocks sign-in from this address, not just this account.`).then((ok) => {
            if (ok) {
              confirmReadyRef.current = true;
              e.currentTarget.requestSubmit();
            }
          });
        }}
      >
        <Button type="submit" size="sm" variant="destructive" disabled={isPending}>
          Ban last known IP ({ip})
        </Button>
      </form>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      {state.message && <p className="text-xs text-muted-foreground">{state.message}</p>}
      {confirmDialog}
    </div>
  );
}

type AdminOverrideState = { error: string | null };

type AdminOverrideAction = (prevState: AdminOverrideState, formData: FormData) => Promise<AdminOverrideState>;

export function AdminMatchOverride({
  player1Username,
  player2Username,
  actionForPlayer1,
  actionForPlayer2,
  undoAction,
}: {
  player1Username: string;
  player2Username: string;
  // Must already be bound server actions (e.g. `serverAction.bind(null, ...)`)
  // — a plain closure built in the parent Server Component isn't a Server
  // Action itself and can't be passed as a prop to this Client Component.
  actionForPlayer1: AdminOverrideAction;
  actionForPlayer2: AdminOverrideAction;
  undoAction: AdminOverrideAction;
}) {
  const [state1, formAction1, isPending1] = useActionState(actionForPlayer1, { error: null });
  const [state2, formAction2, isPending2] = useActionState(actionForPlayer2, { error: null });
  const [undoState, undoFormAction, isPendingUndo] = useActionState(undoAction, { error: null });
  const error = state1.error ?? state2.error ?? undoState.error;
  const anyPending = isPending1 || isPending2 || isPendingUndo;
  const [confirm, confirmDialog] = useConfirm();
  const undoReadyRef = useRef(false);

  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        Mod: change winner
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">
        <div className="flex gap-2">
          <form action={formAction1}>
            <Button type="submit" size="sm" variant="outline" disabled={anyPending}>
              {player1Username} won
            </Button>
          </form>
          <form action={formAction2}>
            <Button type="submit" size="sm" variant="outline" disabled={anyPending}>
              {player2Username} won
            </Button>
          </form>
        </div>
        <form
          action={undoFormAction}
          onSubmit={(e) => {
            if (undoReadyRef.current) {
              undoReadyRef.current = false;
              return;
            }
            e.preventDefault();
            confirm(
              "Undo this match? Reverts both players' rating back to right before it and cancels it outright — can't be undone.",
              { confirmLabel: "Undo match", variant: "destructive" },
            ).then((ok) => {
              if (ok) {
                undoReadyRef.current = true;
                e.currentTarget.requestSubmit();
              }
            });
          }}
        >
          <Button type="submit" size="sm" variant="destructive" disabled={anyPending}>
            Undo match (refund Elo)
          </Button>
        </form>
        {error && <p className="text-destructive">{error}</p>}
      </div>
      {confirmDialog}
    </details>
  );
}
