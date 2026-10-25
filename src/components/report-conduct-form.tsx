"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

type ReportConductState = { error: string | null; message: string | null };

export function ReportConductForm({
  action,
  lang = "en",
}: {
  action: (prevState: ReportConductState, formData: FormData) => Promise<ReportConductState>;
  lang?: Lang;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null, message: null });

  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        {tr(lang, { en: "Report a problem", es: "Reportar un problema", ja: "問題を報告する" })}
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">
        <form action={formAction} className="flex items-end gap-2">
          <textarea
            name="reason"
            required
            rows={2}
            placeholder={tr(lang, { en: "What happened?", es: "¿Qué pasó?", ja: "何がありましたか？" })}
            maxLength={1000}
            className="w-full resize-none rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
          />
          <Button type="submit" size="sm" variant="outline" disabled={isPending}>
            {tr(lang, { en: "Submit", es: "Enviar", ja: "送信" })}
          </Button>
        </form>
        {state.error && <p className="text-destructive">{state.error}</p>}
        {state.message && <p className="text-muted-foreground">{state.message}</p>}
      </div>
    </details>
  );
}
