"use client";

import { CharacterSelect } from "@/components/character-select";

/**
 * Wraps CharacterSelect in a label so it slots into the leaderboard's
 * server-rendered filter form. Uses the `name` prop so the selected value
 * is submitted with the form via a hidden native <select>.
 */
export function CharacterFilterSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      Character
      {/* key forces remount so defaultValue syncs when searchParams change */}
      <CharacterSelect key={defaultValue} name="character" defaultValue={defaultValue} placeholder="All players" />
    </label>
  );
}
