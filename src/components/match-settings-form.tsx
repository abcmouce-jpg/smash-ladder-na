"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

export type MatchSettingsState = { error: string | null; saved: boolean };

// Auto-submit because skipping Save here means never being able to queue
// Save stays visible since the change handler isn't attached until hydration
export function MatchSettingsForm({
  action,
  className,
  children,
}: {
  action: (prevState: MatchSettingsState, formData: FormData) => Promise<MatchSettingsState>;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null, saved: false });

  return (
    <form
      action={formAction}
      className={className}
      onChange={(e) => e.currentTarget.requestSubmit()}
    >
      {children}
      {state.error && <p className="mt-3 text-xs text-destructive">{state.error}</p>}
      <div className="mt-4 flex items-center justify-end gap-3">
        {isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
        {!isPending && state.saved && !state.error && (
          <span className="text-xs text-muted-foreground">Saved</span>
        )}
        <Button type="submit" size="sm" disabled={isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
