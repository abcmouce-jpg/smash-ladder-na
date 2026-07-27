"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JoinLobbyState } from "@/app/lobby/actions";

export function JoinLobbyForm({
  action,
  className,
}: {
  action: (prevState: JoinLobbyState, formData: FormData) => Promise<JoinLobbyState>;
  className?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null });

  return (
    <form action={formAction} className={className}>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input type="checkbox" name="isPracticing" className="size-3.5" />
        Practicing this session (bans your main character, uses a separate practice rating)
      </label>
      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Searching for an opponent…
          </>
        ) : (
          "Search for New Opponent"
        )}
      </Button>
      {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
