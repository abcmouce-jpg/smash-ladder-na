"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createTournamentAction } from "@/app/tournaments/actions";
import type { Lang } from "@/lib/i18n";

export function CreateTournamentForm({ lang = "en" }: { lang?: Lang }) {
  const [state, formAction, isPending] = useActionState(createTournamentAction, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {lang === "es" ? "Nombre" : "Name"}
        <input
          name="name"
          required
          maxLength={100}
          placeholder={lang === "es" ? "p. ej. Bracket del viernes por la noche" : "e.g. Friday Night Bracket"}
          className="h-8 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {lang === "es"
          ? "Enlace de start.gg (opcional, añádelo antes de que cierre el check-in)"
          : "start.gg link (optional, add before check-in closes)"}
        <input
          name="startggUrl"
          type="url"
          placeholder="https://start.gg/tournament/..."
          className="h-8 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {lang === "es" ? "Descripción (opcional)" : "Description (optional)"}
        <textarea
          name="description"
          rows={2}
          maxLength={1000}
          placeholder={lang === "es" ? "Reglas, notas de formato, etc." : "Rules, format notes, etc."}
          className="w-full resize-none rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <Button type="submit" className="self-start" disabled={isPending}>
        {lang === "es" ? "Organizar un torneo" : "Host a tournament"}
      </Button>
    </form>
  );
}
