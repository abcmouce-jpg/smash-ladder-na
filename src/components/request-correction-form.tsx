"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

type CorrectionState = { error: string | null; message: string | null };

export function RequestCorrectionForm({
  action,
  myId,
  opponentId,
  opponentUsername,
  lang = "en",
}: {
  action: (prevState: CorrectionState, formData: FormData) => Promise<CorrectionState>;
  myId: string;
  opponentId: string;
  opponentUsername: string;
  lang?: Lang;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null, message: null });

  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        {tr(lang, { en: "Wrong result?", es: "¿Resultado incorrecto?", ja: "結果が違いますか？" })}
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">
        <p className="text-muted-foreground">
          {tr(lang, {
            en: `Only works while this is still both of your most recent confirmed match. If your pick doesn't match ${opponentUsername}'s, a mod reviews it instead.`,
            es: `Solo funciona mientras esta siga siendo la partida confirmada más reciente de ambos. Si tu elección no coincide con la de ${opponentUsername}, un mod la revisa en su lugar.`,
            ja: `この操作は、両者にとってこれが最新の確定試合である間だけ有効です。${opponentUsername}さんの選択と食い違った場合は、モデレーターが確認します。`,
          })}
        </p>
        <form action={formAction} className="flex gap-2">
          <Button type="submit" name="winnerId" value={myId} size="sm" variant="outline" disabled={isPending}>
            {tr(lang, { en: "I actually won", es: "Yo gané en realidad", ja: "自分が勝ちました" })}
          </Button>
          <Button type="submit" name="winnerId" value={opponentId} size="sm" variant="outline" disabled={isPending}>
            {tr(lang, {
              en: `${opponentUsername} actually won`,
              es: `${opponentUsername} ganó en realidad`,
              ja: `${opponentUsername}が勝ちました`,
            })}
          </Button>
        </form>
        {state.error && <p className="text-destructive">{state.error}</p>}
        {state.message && <p className="text-muted-foreground">{state.message}</p>}
      </div>
    </details>
  );
}
