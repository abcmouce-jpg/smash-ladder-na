"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JoinLobbyState } from "@/app/lobby/actions";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

// This form fully remounts every time the lobby page re-renders around it —
// e.g. cancel a match then requeue — so without this the checkbox silently
// resets to unchecked and a player who meant to stay in practice mode ends
// up queueing a rated set instead. Persisted client-side since it's a
// per-player queueing preference, not tied to any one match.
const PRACTICING_KEY = "smashLadderPracticing";

export function JoinLobbyForm({
  action,
  className,
  lang = "en",
  hasRegion = true,
}: {
  action: (prevState: JoinLobbyState, formData: FormData) => Promise<JoinLobbyState>;
  className?: string;
  lang?: Lang;
  /** Region is required to queue, so the lobby gates the button on it rather
   *  than letting the server reject an unqueueable join. */
  hasRegion?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null });
  const [existingRoomCode, setExistingRoomCode] = useState("");
  const [isPracticing, setIsPracticing] = useState(false);

  useEffect(() => {
    // Deferred a tick (rather than reading localStorage and calling
    // setIsPracticing directly in the effect body) so this doesn't trigger
    // react-hooks/set-state-in-effect's cascading-render warning — same
    // async-callback shape as push-nudge-banner's mount check.
    queueMicrotask(() => {
      try {
        if (localStorage.getItem(PRACTICING_KEY) === "1") setIsPracticing(true);
      } catch {
        /* localStorage unavailable */
      }
    });
  }, []);

  function updatePracticing(checked: boolean) {
    setIsPracticing(checked);
    try {
      localStorage.setItem(PRACTICING_KEY, checked ? "1" : "0");
    } catch {
      /* localStorage unavailable */
    }
  }

  return (
    <form action={formAction} className={className}>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <input
          type="checkbox"
          name="isPracticing"
          checked={isPracticing}
          onChange={(e) => updatePracticing(e.target.checked)}
          className="mt-0.5 size-4 rounded border-border"
        />
        <span>
          <span className="font-medium">
            {tr(lang, {
              en: "Practicing this session",
              es: "Practicando esta sesión",
              ja: "このセッションは練習として参加",
            })}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {tr(lang, {
              en: "Results count toward a separate practice rating — your regular ladder rating and sets played don't move at all.",
              es: "Los resultados cuentan para una clasificación de práctica aparte — tu clasificación normal del ladder y tus partidas jugadas no se mueven en absoluto.",
              ja: "結果は練習レートにのみ反映されます。通常のレートとセット数は一切動きません。",
            })}
          </span>
        </span>
      </label>

      <details className="mt-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
        <summary className="cursor-pointer select-none text-sm text-muted-foreground hover:text-foreground">
          {tr(lang, {
            en: "Already have a room set up? (optional)",
            es: "¿Ya tienes una sala lista? (opcional)",
            ja: "部屋をもう立ててありますか？（任意）",
          })}
        </summary>
        <label className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
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
            {tr(lang, {
              en: "As long as your opponent doesn't also bring one, you'll be host and they'll see this right away.",
              es: "Si tu rival no trae una sala también, tú serás el anfitrión y la verá al instante.",
              ja: "相手も部屋番号を持ってこない限り、あなたが部屋主になり、相手にはすぐこれが表示されます。",
            })}
          </span>
        </label>
      </details>

      <Button
        type="submit"
        size="lg"
        className="mt-4 h-11 w-full gap-2 px-8 text-base sm:w-auto"
        disabled={isPending || !hasRegion}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Swords className="size-4" />}
        {tr(lang, { en: "Find Match", es: "Buscar partida", ja: "対戦相手を探す" })}
      </Button>
      {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
