"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createTournamentAction } from "@/app/tournaments/actions";

export function CreateTournamentForm() {
  const [state, formAction, isPending] = useActionState(createTournamentAction, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          name="name"
          required
          maxLength={100}
          placeholder="e.g. Friday Night Bracket"
          className="h-8 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        start.gg link (optional, add before check-in closes)
        <input
          name="startggUrl"
          type="url"
          placeholder="https://start.gg/tournament/..."
          className="h-8 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Description (optional)
        <textarea
          name="description"
          rows={2}
          maxLength={1000}
          placeholder="Rules, format notes, etc."
          className="w-full resize-none rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <Button type="submit" className="self-start" disabled={isPending}>
        Host a tournament
      </Button>
    </form>
  );
}
