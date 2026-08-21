"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_QUICK_MESSAGES } from "@/lib/quick-messages";

type QuickMessagesState = { error: string | null };

export function QuickMessagesForm({
  action,
  defaultValues,
  maxLength,
  lang = "en",
}: {
  action: (prevState: QuickMessagesState, formData: FormData) => Promise<QuickMessagesState>;
  defaultValues: string[];
  maxLength: number;
  lang?: "en" | "es";
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null });
  const slots = Array.from({ length: DEFAULT_QUICK_MESSAGES.length }, (_, i) => defaultValues[i] ?? "");

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <p className="text-sm font-medium">{lang === "es" ? "Mensajes rápidos del chat" : "Chat quick messages"}</p>
      <p className="text-xs text-muted-foreground">
        {lang === "es"
          ? "Los botones que aparecen sobre el chat de la partida. Deja uno en blanco para usar el valor por defecto."
          : "The buttons shown above the match chat. Leave one blank to use the site default for that slot."}
      </p>
      <div className="flex flex-wrap gap-2">
        {slots.map((value, i) => (
          <input
            key={i}
            name="quickMessage"
            type="text"
            maxLength={maxLength}
            defaultValue={value}
            placeholder={DEFAULT_QUICK_MESSAGES[i]}
            className="h-8 w-28 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
          />
        ))}
      </div>
      <div>
        <Button type="submit" size="sm" disabled={isPending}>
          {lang === "es" ? "Guardar" : "Save"}
        </Button>
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
