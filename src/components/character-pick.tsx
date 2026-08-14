"use client";

import { useState } from "react";
import { CharacterIcon } from "@/components/character-icon";
import { CharacterSelect } from "@/components/character-select";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/lib/i18n";

/**
 * Character picker with one-click shortcuts for the player's most-played
 * characters. The shortcuts only fill the select — the player still presses
 * "Lock in" to submit (game 1 is a blind pick, so picking is irreversible).
 */
export function CharacterPickForm({
  defaultCharacter,
  topCharacters,
  action,
  lang,
}: {
  defaultCharacter: string | null;
  topCharacters: string[];
  action: (formData: FormData) => void | Promise<void>;
  lang: Lang;
}) {
  const [character, setCharacter] = useState(defaultCharacter ?? "");

  return (
    <div className="mt-3">
      {topCharacters.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {topCharacters.map((char) => (
            <Button
              key={char}
              type="button"
              size="sm"
              variant={character === char ? "default" : "outline"}
              onClick={() => setCharacter(char)}
              className="flex items-center gap-1.5 px-2.5"
            >
              <CharacterIcon name={char} size={16} />
              <span>{char}</span>
            </Button>
          ))}
        </div>
      )}
      <form action={action} className="flex items-end gap-2">
        <CharacterSelect
          value={character}
          onChange={setCharacter}
          name="character"
          placeholder={lang === "es" ? "Elegir personaje" : "Select character"}
        />
        <Button type="submit" size="sm" variant="outline">
          {lang === "es" ? "Elegir" : "Lock in"}
        </Button>
      </form>
    </div>
  );
}
