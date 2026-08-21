"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";

export function EndSeasonButton({ action, seasonName }: { action: () => Promise<void>; seasonName: string }) {
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
            `End "${seasonName}" and start the next one? This resets EVERYONE's rating to 1500 and sets played to 0. This can't be undone.`,
          ).then((ok) => {
            if (ok) {
              confirmReadyRef.current = true;
              form.requestSubmit();
            }
          });
        }}
      >
        <Button type="submit" variant="destructive" size="sm">
          End season &amp; start next
        </Button>
      </form>
      {confirmDialog}
    </>
  );
}
