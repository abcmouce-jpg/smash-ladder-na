"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createTournamentAction } from "@/app/tournaments/actions";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

export function CreateTournamentForm({ lang = "en" }: { lang?: Lang }) {
  const [state, formAction, isPending] = useActionState(createTournamentAction, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {tr(lang, { en: "Name", es: "Nombre", ja: "大会名" })}
        <input
          name="name"
          required
          maxLength={100}
          placeholder={tr(lang, {
            en: "e.g. Friday Night Bracket",
            es: "p. ej. Bracket del viernes por la noche",
            ja: "例：金曜夜のブラケット",
          })}
          className="h-8 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {tr(lang, {
          en: "start.gg link (optional, add before check-in closes)",
          es: "Enlace de start.gg (opcional, añádelo antes de que cierre el check-in)",
          ja: "start.gg のリンク（任意。受付終了までに追加してください）",
        })}
        <input
          name="startggUrl"
          type="url"
          placeholder="https://start.gg/tournament/..."
          className="h-8 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {tr(lang, { en: "Description (optional)", es: "Descripción (opcional)", ja: "説明（任意）" })}
        <textarea
          name="description"
          rows={2}
          maxLength={1000}
          placeholder={tr(lang, {
            en: "Rules, format notes, etc.",
            es: "Reglas, notas de formato, etc.",
            ja: "ルールや形式などを書いてください。",
          })}
          className="w-full resize-none rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <Button type="submit" className="self-start" disabled={isPending}>
        {tr(lang, { en: "Host a tournament", es: "Organizar un torneo", ja: "大会を立てる" })}
      </Button>
    </form>
  );
}
