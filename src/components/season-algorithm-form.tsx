"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { RatingAlgorithm } from "@/generated/prisma/enums";
import { RATING_ALGORITHM_LABEL, RATING_ALGORITHMS } from "@/lib/rating-algorithm";

// Switches the running season's math, for the case where the instance's
// RATING_SYSTEM was decided after the season had already opened. The server
// refuses once the season has rated anything (see setActiveSeasonAlgorithm),
// so this is only ever shown for a season that has rated nothing — the
// confirm is there because the choice decides how every set in it will score.
export function SeasonAlgorithmForm({
  action,
  current,
  seasonName,
}: {
  action: (formData: FormData) => Promise<void>;
  current: RatingAlgorithm;
  seasonName: string;
}) {
  const [confirm, confirmDialog] = useConfirm();
  const confirmReadyRef = useRef(false);

  return (
    <>
      <form
        action={action}
        className="flex flex-wrap items-center gap-2"
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
          const picked = new FormData(form).get("algorithm");
          const label = RATING_ALGORITHM_LABEL[picked as RatingAlgorithm] ?? String(picked);
          confirm(`Rate ${seasonName} with ${label} from here on?`, { confirmLabel: "Change" }).then((ok) => {
            if (ok) {
              confirmReadyRef.current = true;
              form.requestSubmit();
            }
          });
        }}
      >
        <select
          name="algorithm"
          defaultValue={current}
          aria-label="Rating system for the running season"
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          {RATING_ALGORITHMS.map((a) => (
            <option key={a} value={a}>
              {RATING_ALGORITHM_LABEL[a]}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline">
          Change rating system
        </Button>
      </form>
      {confirmDialog}
    </>
  );
}
