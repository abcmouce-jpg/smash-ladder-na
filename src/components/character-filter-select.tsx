"use client";

import { CharacterSelect } from "@/components/character-select";

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
  lang?: "en" | "es";
  /** Forwarded to CharacterSelect's trigger — see its className doc. */
  className?: string;
}) {
  return (
    <label className="flex w-full flex-col gap-1 text-sm md:w-auto">
      {lang === "es" ? "Personaje" : "Character"}
      {/* key forces remount so defaultValue syncs when searchParams change */}
      <CharacterSelect
        key={defaultValue}
        name="character"
        defaultValue={defaultValue}
        placeholder={lang === "es" ? "Todos los personajes" : "All characters"}
        clearLabel={lang === "es" ? "Todos los personajes" : "All Characters"}
        className={className}
      />
    </label>
  );
}
