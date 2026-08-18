"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";

export function DeleteAccountButton({ action, lang = "en" }: { action: () => Promise<void>; lang?: "en" | "es" }) {
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
            lang === "es"
              ? "¿Eliminar tu cuenta? Tu nombre de usuario, avatar y correo electrónico se eliminan permanentemente. El historial de partidas se mantiene (anonimizado) para que los registros de otros jugadores sigan siendo correctos. Esto no se puede deshacer."
              : "Delete your account? Your username, avatar, and email are removed permanently. Match history stays (anonymized) so other players' records stay intact. This can't be undone.",
          ).then((ok) => {
            if (ok) {
              confirmReadyRef.current = true;
              form.requestSubmit();
            }
          });
        }}
      >
        <Button type="submit" variant="destructive" size="sm">
          {lang === "es" ? "Eliminar mi cuenta" : "Delete my account"}
        </Button>
      </form>
      {confirmDialog}
    </>
  );
}
