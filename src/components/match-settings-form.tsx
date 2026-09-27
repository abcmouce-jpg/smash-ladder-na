"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";

export type MatchSettingsState = { error: string | null; saved: boolean };

// Changes save automatically on every edit — there's no Save button, so the
// status line is the only signal that a change stuck (or is still in flight).
export function MatchSettingsForm({
  action,
  className,
  children,
  lang = "en",
  disabled = false,
}: {
  action: (prevState: MatchSettingsState, formData: FormData) => Promise<MatchSettingsState>;
  className?: string;
  children: React.ReactNode;
  lang?: "en" | "es";
  disabled?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null, saved: false });

  return (
    <form
      action={formAction}
      className={className}
      onChange={(e) => {
        if (!disabled) e.currentTarget.requestSubmit();
      }}
    >
      {children}
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <div className="border-t border-border pt-4">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              {lang === "es" ? "Guardando…" : "Saving…"}
            </>
          ) : state.saved && !state.error ? (
            <>
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              {lang === "es" ? "Todo guardado" : "All changes saved"}
            </>
          ) : (
            <>{lang === "es" ? "Los cambios se guardan solos" : "Changes save automatically"}</>
          )}
        </p>
      </div>
    </form>
  );
}
