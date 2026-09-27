"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SettingsSaveState = { error: string | null; saved: boolean };

// One Save per Settings tab: everything saveable in a tab lives in a single
// <form>, and this wraps it with the pending/saved feedback and the submit
// button. Unlike the Lobby's MatchSettingsForm this doesn't auto-submit —
// Settings aren't time-sensitive, so an explicit Save keeps them deliberate.
export function SettingsSaveForm({
  action,
  children,
  className,
  lang = "en",
}: {
  action: (prevState: SettingsSaveState, formData: FormData) => Promise<SettingsSaveState>;
  children: React.ReactNode;
  className?: string;
  lang?: "en" | "es";
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null, saved: false });

  return (
    <form action={formAction} className={className}>
      {children}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        {state.error ? (
          <p className="mr-auto text-xs text-destructive">{state.error}</p>
        ) : state.saved ? (
          <p className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            {lang === "es" ? "Guardado" : "Saved"}
          </p>
        ) : null}
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          {lang === "es" ? "Guardar" : "Save"}
        </Button>
      </div>
    </form>
  );
}
