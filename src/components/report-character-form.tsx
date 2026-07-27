"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CharacterSelect } from "@/components/character-select";
import type { ReportCharacterState } from "@/app/lobby/actions";

export function ReportCharacterForm({
  action,
  opponentName,
}: {
  action: (prevState: ReportCharacterState, formData: FormData) => Promise<ReportCharacterState>;
  opponentName: string;
}) {
  const [state, formAction, isPending] = useActionState(action, {
    reportedCharacter: null,
    error: null,
  });

  return (
    <div className="mt-4 flex flex-col gap-1">
      <form action={formAction} className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          What character did {opponentName} play? (optional)
          <CharacterSelect
            name="character"
            defaultValue=""
            placeholder="Skip"
          />
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          Report
        </Button>
      </form>
      {state.reportedCharacter && (
        <p className="text-xs text-muted-foreground">
          ✓ Marked {opponentName} as playing {state.reportedCharacter}.
        </p>
      )}
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}
