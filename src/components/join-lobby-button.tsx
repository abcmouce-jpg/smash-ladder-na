"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JoinLobbyState } from "@/app/lobby/actions";

export function JoinLobbyForm({
  action,
  className,
  lang = "en",
}: {
  action: (prevState: JoinLobbyState, formData: FormData) => Promise<JoinLobbyState>;
  className?: string;
  lang?: "en" | "es";
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null });
  const [existingRoomCode, setExistingRoomCode] = useState("");

  return (
    <form action={formAction} className={className}>
      <label className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <input type="checkbox" name="isPracticing" className="mt-0.5 size-3.5" />
        <span>
          {lang === "es" ? "Practicando esta sesión" : "Practicing this session"}
          <span className="block text-xs">
            {lang === "es"
              ? "Los resultados cuentan para una clasificación de práctica aparte — tu clasificación normal del ladder y tus partidas jugadas no se mueven en absoluto."
              : "Results count toward a separate practice rating — your regular ladder rating and sets played don't move at all."}
          </span>
        </span>
      </label>
      <label className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
        {lang === "es" ? "¿Ya tienes una sala lista? (opcional)" : "Already have a room set up? (optional)"}
        <input
          name="existingRoomCode"
          value={existingRoomCode}
          onChange={(e) =>
            setExistingRoomCode(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, 5),
            )
          }
          placeholder="e.g. AB123"
          maxLength={5}
          pattern="[A-Z0-9]{5}"
          autoCapitalize="characters"
          spellCheck={false}
          className="h-8 w-40 rounded-lg border border-border bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
        />
        <span className="text-xs">
          {lang === "es"
            ? "Si tu rival no trae una sala también, tú serás el anfitrión y la verá al instante."
            : "As long as your opponent doesn't also bring one, you'll be host and they'll see this right away."}
        </span>
      </label>
      <Button type="submit" size="lg" className="text-2xl mt-3 px-12 py-6" disabled={isPending}>
        {isPending && <Loader2 className="size-4 animate-spin" />}
        {lang === "es" ? "Buscar partida" : "Find Match"}
      </Button>
      {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
