"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { RatingAlgorithm } from "@/generated/prisma/enums";

const ALGORITHM_LABEL: Record<RatingAlgorithm, string> = {
  ELO: "Elo",
  GLICKO2: "Glicko-2",
};

export function EndSeasonButton({
  action,
  seasonName,
}: {
  action: (formData: FormData) => Promise<void>;
  seasonName: string;
}) {
  const [confirm, confirmDialog] = useConfirm();
  const confirmReadyRef = useRef(false);
  // Glicko-2 by default — it's what new seasons run on (see
  // NEXT_SEASON_ALGORITHM in lib/seasons); Elo remains selectable for a
  // deliberate one-off legacy season.
  const [algorithm, setAlgorithm] = useState<RatingAlgorithm>(RatingAlgorithm.GLICKO2);

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
            `End "${seasonName}" and start the next one on ${ALGORITHM_LABEL[algorithm]}? This resets EVERYONE's rating and practice rating to 1500 and sets played to 0. Any unresolved match is cancelled with no rating impact. This can't be undone.`,
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
          placeholder="Length in days (default 2 months)"
          className="h-7 w-40 rounded-lg border border-border bg-background px-1.5 text-xs text-foreground outline-none focus-visible:border-ring"
        />
        <select
          name="nextAlgorithm"
          value={algorithm}
          onChange={(e) => setAlgorithm(e.target.value as RatingAlgorithm)}
          aria-label="Rating system for the next season"
          className="h-7 rounded-lg border border-border bg-background px-1.5 text-xs text-foreground outline-none focus-visible:border-ring"
        >
          <option value={RatingAlgorithm.GLICKO2}>Glicko-2</option>
          <option value={RatingAlgorithm.ELO}>Elo (legacy)</option>
        </select>
        <Button type="submit" variant="destructive" size="sm">
          End season &amp; start next
        </Button>
      </form>
      {confirmDialog}
    </>
  );
}
