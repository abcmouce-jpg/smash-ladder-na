"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { WiredConnectionState } from "@/app/lobby/actions";

export function WiredConnectionForm({
  action,
  defaultChecked,
}: {
  action: (prevState: WiredConnectionState, formData: FormData) => Promise<WiredConnectionState>;
  defaultChecked: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="wired"
            defaultChecked={defaultChecked}
            className="size-4 rounded border-border"
          />
          On a wired (LAN) connection
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          Save
        </Button>
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
