"use client";

import { Button } from "@/components/ui/button";

export function EndSeasonButton({ action, seasonName }: { action: () => Promise<void>; seasonName: string }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `End "${seasonName}" and start the next one? This resets EVERYONE's rating to 1500 and games played to 0. This can't be undone.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <Button type="submit" variant="destructive" size="sm">
        End season &amp; start next
      </Button>
    </form>
  );
}
