"use client";

import { useEffect, useRef, useState, useActionState } from "react";
import { useFlashOnChange } from "@/lib/use-flash-on-change";
import type { RoomCodeState } from "@/app/lobby/actions";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

// Idle time before a typed code is pushed to the server — long enough that a
// code typed straight through only saves once, short enough that the value is
// already stored by the time pairing needs it to pick a host.
const AUTOSAVE_DELAY_MS = 700;

// The server accepts a full code, or empty to clear it. A half-typed one would
// only come back as an error, so autosave just waits for the rest of it.
const COMPLETE_ROOM_CODE = /^[A-Z0-9]{5}$/;

// The queue-time companion to RoomCodeForm (which is for the in-match host):
// a player already waiting can set or clear the room code they brought with
// them, without having to cancel and rejoin. Unlike the match form, empty is
// valid — it clears the code back to "bring one at pair time". There's no save
// button here: the value is autosaved once typing stops (or on Enter), since a
// player who forgets to hit save would otherwise get paired without a code.
export function QueueRoomCodeForm({
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
  // What the server already has (or what we just sent it), so pausing on an
  // unchanged field doesn't save the same value again.
  const syncedRef = useRef(initialValue);

  useEffect(() => {
    if (roomCode === syncedRef.current) return;
    if (roomCode !== "" && !COMPLETE_ROOM_CODE.test(roomCode)) return;
    const timer = setTimeout(() => {
      syncedRef.current = roomCode;
      const formData = new FormData();
      formData.set("existingRoomCode", roomCode);
      formAction(formData);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [roomCode, formAction]);

  return (
    <div className="flex flex-col gap-1">
      <form
        action={formAction}
        onSubmit={() => {
          syncedRef.current = roomCode;
        }}
        className="flex flex-col gap-1"
        autoComplete="off"
      >
        <label className="flex flex-col gap-1 text-sm">
          {tr(lang, {
            en: "Already have a room set up? (optional)",
            es: "¿Ya tienes una sala lista? (opcional)",
            ja: "部屋をもう立ててありますか？（任意）",
          })}
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
            placeholder={tr(lang, { en: "e.g. AB123", es: "ej. AB123", ja: "例: AB123" })}
            maxLength={5}
            pattern="[A-Z0-9]{5}"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            className={`h-8 w-40 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none transition-colors duration-500 focus-visible:border-ring ${
              flashing ? "bg-primary/15" : ""
            }`}
          />
        </label>
      </form>
      <p className="text-xs text-muted-foreground">
        {tr(lang, {
          en: "As long as your opponent doesn't also bring one, you'll be host and they'll see this right away. Leave it empty to clear it.",
          es: "Si tu rival no trae una sala también, tú serás el anfitrión y la verá al instante. Déjalo vacío para quitarla.",
          ja: "相手も部屋番号を持ってこない限り、あなたが部屋主になり、相手にはすぐこれが表示されます。空欄にすると取り消せます。",
        })}
      </p>
      {state.error ? (
        <p className="text-xs text-destructive">{state.error}</p>
      ) : isPending ? (
        <p className="text-xs text-muted-foreground">{tr(lang, { en: "Saving…", es: "Guardando…", ja: "保存中…" })}</p>
      ) : (
        flashing && (
          <p className="text-xs text-muted-foreground">
            {tr(lang, { en: "Saved!", es: "¡Guardado!", ja: "保存しました！" })}
          </p>
        )
      )}
    </div>
  );
}
