"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

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
  lang?: Lang;
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
              {tr(lang, { en: "Saving…", es: "Guardando…", ja: "保存中…" })}
            </>
          ) : state.saved && !state.error ? (
            <>
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              {tr(lang, { en: "All changes saved", es: "Todo guardado", ja: "すべて保存しました" })}
            </>
          ) : (
            <>
              {tr(lang, {
                en: "Changes save automatically",
                es: "Los cambios se guardan solos",
                ja: "変更は自動で保存されます",
              })}
            </>
          )}
        </p>
      </div>
    </form>
  );
}
