"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

export function DeleteAccountButton({ action, lang = "en" }: { action: () => Promise<void>; lang?: Lang }) {
  const [confirm, confirmDialog] = useConfirm();
  const confirmReadyRef = useRef(false);

  return (
    <>
      <form
        action={action}
        onSubmit={(e) => {
          if (confirmReadyRef.current) {
            confirmReadyRef.current = false;
            return;
          }
          e.preventDefault();
          // Captured now, not read off `e` in the .then() below — React nulls
          // out a SyntheticEvent's currentTarget once the synchronous handler
          // dispatch finishes, and confirm() resolves asynchronously.
          const form = e.currentTarget;
          confirm(
            tr(lang, {
              en: "Delete your account? Your username, avatar, and email are removed permanently. Match history stays (anonymized) so other players' records stay intact. This can't be undone.",
              es: "¿Eliminar tu cuenta? Tu nombre de usuario, avatar y correo electrónico se eliminan permanentemente. El historial de partidas se mantiene (anonimizado) para que los registros de otros jugadores sigan siendo correctos. Esto no se puede deshacer.",
              ja: "アカウントを削除しますか？ユーザー名・アイコン・メールアドレスは完全に削除されます。対戦履歴は匿名化して残り、ほかのプレイヤーの戦績は保たれます。この操作は取り消せません。",
            }),
          ).then((ok) => {
            if (ok) {
              confirmReadyRef.current = true;
              form.requestSubmit();
            }
          });
        }}
      >
        <Button type="submit" variant="destructive" size="sm">
          {tr(lang, { en: "Delete my account", es: "Eliminar mi cuenta", ja: "アカウントを削除する" })}
        </Button>
      </form>
      {confirmDialog}
    </>
  );
}
