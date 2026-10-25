"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { useFlashOnChange } from "@/lib/use-flash-on-change";
import type { RoomCodeState } from "@/app/lobby/actions";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

// The setter's own editable room code field — flashes and plays a short
// blip on a successful save (in addition to the input already showing
// whatever they typed) so it's unambiguous the change actually went
// through, not just that the form submitted.
export function RoomCodeForm({
  initialValue,
  action,
  lang = "en",
}: {
  initialValue: string;
  action: (prevState: RoomCodeState, formData: FormData) => Promise<RoomCodeState>;
  lang?: Lang;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null, savedValue: null });
  const flashing = useFlashOnChange(state.savedValue);
  const [roomCode, setRoomCode] = useState(initialValue);

  return (
    <div className="flex flex-col gap-1">
      <form action={formAction} className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {tr(lang, { en: "Room code", es: "Código de sala", ja: "部屋番号" })}
          <input
            name="roomCode"
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
            required
            autoCapitalize="characters"
            spellCheck={false}
            className={`h-8 w-40 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none transition-colors duration-500 focus-visible:border-ring ${
              flashing ? "bg-primary/15" : ""
            }`}
          />
        </label>
        <Button type="submit" size="sm" disabled={isPending}>
          {tr(lang, { en: "Save", es: "Guardar", ja: "保存" })}
        </Button>
      </form>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      {flashing && !state.error && (
        <p className="text-xs text-muted-foreground">
          {tr(lang, { en: "Saved!", es: "¡Guardado!", ja: "保存しました！" })}
        </p>
      )}
    </div>
  );
}
