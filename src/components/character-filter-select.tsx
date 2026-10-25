"use client";

import { CharacterSelect } from "@/components/character-select";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

/**
 * Wraps CharacterSelect in a label so it slots into the leaderboard's
 * server-rendered filter form. Uses the `name` prop so the selected value
 * is submitted with the form via a hidden native <select>.
 */
export function CharacterFilterSelect({
  defaultValue,
  lang = "en",
  className,
}: {
  defaultValue: string;
  lang?: Lang;
  /** Forwarded to CharacterSelect's trigger — see its className doc. */
  className?: string;
}) {
  return (
    <label className="flex w-full flex-col gap-1 text-sm md:w-auto">
      {tr(lang, { en: "Character", es: "Personaje", ja: "キャラクター" })}
      {/* key forces remount so defaultValue syncs when searchParams change */}
      <CharacterSelect
        key={defaultValue}
        name="character"
        defaultValue={defaultValue}
        placeholder={tr(lang, { en: "All characters", es: "Todos los personajes", ja: "すべてのキャラ" })}
        clearLabel={tr(lang, { en: "All Characters", es: "Todos los personajes", ja: "すべてのキャラクター" })}
        className={className}
      />
    </label>
  );
}
