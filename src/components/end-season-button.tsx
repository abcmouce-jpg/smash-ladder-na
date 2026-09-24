"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";

export function EndSeasonButton({ action, seasonName }: { action: (formData: FormData) => Promise<void>; seasonName: string }) {
  const [confirm, confirmDialog] = useConfirm();
  const confirmReadyRef = useRef(false);

  return (
    <>
      <form
        action={action}
        className="flex flex-wrap items-center gap-1.5"
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
            `End "${seasonName}" and start the next one? This resets EVERYONE's rating to 1500 and sets played to 0. Any unresolved match is cancelled with no rating impact. This can't be undone.`,
          ).then((ok) => {
            if (ok) {
              confirmReadyRef.current = true;
              form.requestSubmit();
            }
          });
        }}
      >
        <input
          type="text"
          name="nextName"
          placeholder="Next season name (optional)"
          className="h-7 w-44 rounded-lg border border-border bg-background px-1.5 text-xs text-foreground outline-none focus-visible:border-ring"
        />
        <input
          type="number"
          name="nextDurationDays"
          min={1}
          placeholder="Length in days (optional)"
          className="h-7 w-40 rounded-lg border border-border bg-background px-1.5 text-xs text-foreground outline-none focus-visible:border-ring"
        />
        <Button type="submit" variant="destructive" size="sm">
          End season &amp; start next
        </Button>
      </form>
      {confirmDialog}
    </>
  );
}
