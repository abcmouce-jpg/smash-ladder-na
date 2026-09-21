"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MatchSettingsState = { error: string | null; saved: boolean };

// Auto-submit because skipping Save here means never being able to queue
// Save stays visible since the change handler isn't attached until hydration
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
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-4">
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
        <Button type="submit" size="sm" variant="outline" disabled={isPending || disabled}>
          {lang === "es" ? "Guardar" : "Save"}
        </Button>
      </div>
    </form>
  );
}
