"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

type ArenaPasswordState = { error: string | null };

export function ArenaPasswordForm({
  action,
  defaultValue,
  fallback,
}: {
  action: (prevState: ArenaPasswordState, formData: FormData) => Promise<ArenaPasswordState>;
  defaultValue: string;
  fallback: string;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null });

  return (
    <div className="flex flex-col gap-1">
      <form action={formAction} className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Arena password
          <span className="text-xs font-normal text-muted-foreground">
            Shown to your opponent as what to set the in-game room password to. Leave blank to use
            the ladder default (<span className="font-medium text-foreground">{fallback}</span>).
          </span>
          <input
            name="arenaPassword"
            type="text"
            maxLength={20}
            defaultValue={defaultValue}
            placeholder={fallback}
            className="h-8 w-40 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
          />
        </label>
        <Button type="submit" size="sm" disabled={isPending}>
          Save
        </Button>
      </form>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}
