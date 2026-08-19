"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { useFlashOnChange } from "@/lib/use-flash-on-change";
import type { RoomCodeState } from "@/app/lobby/actions";

// The queue-time companion to RoomCodeForm (which is for the in-match host):
// a player already waiting can set or clear the room code they brought with
// them, without having to cancel and rejoin. Unlike the match form, empty is
// valid — it clears the code back to "bring one at pair time".
export function QueueRoomCodeForm({
  initialValue,
  action,
  lang = "en",
}: {
  initialValue: string;
  action: (prevState: RoomCodeState, formData: FormData) => Promise<RoomCodeState>;
  lang?: "en" | "es";
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null, savedValue: null });
  const flashing = useFlashOnChange(state.savedValue);
  const [roomCode, setRoomCode] = useState(initialValue);

  return (
    <div className="flex flex-col gap-1">
      <form action={formAction} className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {lang === "es" ? "¿Ya tienes una sala lista? (opcional)" : "Already have a room set up? (optional)"}
          <input
            name="existingRoomCode"
            value={roomCode}
            onChange={(e) =>
              setRoomCode(
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
            className={`h-8 w-40 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none transition-colors duration-500 focus-visible:border-ring ${
              flashing ? "bg-primary/15" : ""
            }`}
          />
        </label>
        <Button type="submit" size="sm" disabled={isPending}>
          {lang === "es" ? "Guardar" : "Save"}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        {lang === "es"
          ? "Si tu rival no trae una sala también, tú serás el anfitrión y la verá al instante. Déjalo vacío para quitarla."
          : "As long as your opponent doesn't also bring one, you'll be host and they'll see this right away. Leave it empty to clear it."}
      </p>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      {flashing && !state.error && (
        <p className="text-xs text-muted-foreground">{lang === "es" ? "¡Guardado!" : "Saved!"}</p>
      )}
    </div>
  );
}
