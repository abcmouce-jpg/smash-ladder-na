"use client";

import { useRef } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

type BlockState = { error: string | null };

export function BlockUserButton({
  action,
  username,
  lang = "en",
}: {
  action: (prevState: BlockState, formData: FormData) => Promise<BlockState>;
  username: string;
  lang?: Lang;
}) {
  const [state, formAction, isPending] = useActionState(action, { error: null });
  const [confirm, confirmDialog] = useConfirm();
  const confirmReadyRef = useRef(false);

  return (
    <div className="flex flex-col items-end gap-1">
      <form
        action={formAction}
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
              en: `Block ${username}? This is permanent and can't be undone — you'll never be matched with them again in ranked queueing.`,
              es: `¿Bloquear a ${username}? Esto es permanente y no se puede deshacer — nunca volverás a emparejarte con esta persona en la cola rankeada.`,
              ja: `${username}さんをブロックしますか？ブロックは永続で、解除できません。レート対戦で二度とマッチングしなくなります。`,
            }),
          ).then((ok) => {
            if (ok) {
              confirmReadyRef.current = true;
              form.requestSubmit();
            }
          });
        }}
      >
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          {tr(lang, { en: "Block", es: "Bloquear", ja: "ブロック" })}
        </Button>
      </form>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      {confirmDialog}
    </div>
  );
}
