"use client";

import { Button } from "@/components/ui/button";

export function DeleteAccountButton({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            "Delete your account? Your username, avatar, and email are removed permanently. Match history stays (anonymized) so other players' records stay intact. This can't be undone.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <Button type="submit" variant="destructive" size="sm">
        Delete my account
      </Button>
    </form>
  );
}
