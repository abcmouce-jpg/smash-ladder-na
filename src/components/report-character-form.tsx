"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ReportCharacterState } from "@/app/lobby/actions";

export function ReportCharacterForm({
  action,
  opponentName,
  characters,
}: {
  action: (prevState: ReportCharacterState, formData: FormData) => Promise<ReportCharacterState>;
  opponentName: string;
  characters: readonly string[];
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
          <select
            name="character"
            defaultValue=""
            className="h-8 w-48 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
          >
            <option value="" className="bg-background text-foreground">
              Skip
            </option>
            {characters.map((c) => (
              <option key={c} value={c} className="bg-background text-foreground">
                {c}
              </option>
            ))}
          </select>
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
