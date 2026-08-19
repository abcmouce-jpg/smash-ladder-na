"use client";

import { useState } from "react";
import { CharacterIcon } from "@/components/character-icon";
import { CharacterSelect } from "@/components/character-select";
import { MovesetDialog } from "@/components/moveset-dialog";
import { Button } from "@/components/ui/button";
import { isMiiCharacter } from "@/lib/characters";
import type { Lang } from "@/lib/i18n";

/**
 * Character picker with one-click shortcuts for the player's most-played
 * characters. The shortcuts only fill the select — the player still presses
 * "Lock in" to submit (game 1 is a blind pick, so picking is irreversible).
 *
 * Picking one of the 3 Mii characters — via the dropdown or a shortcut
 * button — pops a MovesetDialog before the pick actually lands in
 * `character` state. Dismissing the dialog without confirming leaves the
 * previous selection in place; there's no "Mii selected, no moveset" state
 * "Lock in" can reach.
 */
export function CharacterPickForm({
  defaultCharacter,
  defaultMoveset,
  topCharacters,
  action,
  lang,
}: {
  defaultCharacter: string | null;
  defaultMoveset: string;
  topCharacters: string[];
  action: (formData: FormData) => void | Promise<void>;
  lang: Lang;
}) {
  // A default Mii pick with no accompanying moveset (game 1 falling back to
  // the player's top character, or an in-flight match from before this
  // feature shipped) can't be pre-selected: there'd be no discoverable way
  // to reach the MovesetDialog for it, since re-picking an already-selected
  // value doesn't change anything from the player's point of view. Start
  // unselected instead, so picking the Mii is a real state change that
  // triggers the dialog.
  const miiWithoutMoveset =
    !!defaultCharacter && isMiiCharacter(defaultCharacter) && !defaultMoveset;
  const [character, setCharacter] = useState(
    miiWithoutMoveset ? "" : (defaultCharacter ?? ""),
  );
  const [moveset, setMoveset] = useState(miiWithoutMoveset ? "" : defaultMoveset);
  const [pendingCharacter, setPendingCharacter] = useState<string | null>(null);

  function attemptSelect(next: string) {
    if (isMiiCharacter(next)) {
      setPendingCharacter(next);
      return;
    }
    setCharacter(next);
    setMoveset("");
  }

  function handleMovesetConfirm(value: string) {
    if (pendingCharacter) {
      setCharacter(pendingCharacter);
      setMoveset(value);
    }
    setPendingCharacter(null);
  }

  function handleMovesetCancel() {
    setPendingCharacter(null);
  }

  const canSubmit = character !== "" && (!isMiiCharacter(character) || moveset !== "");

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
              onClick={() => attemptSelect(char)}
              className="flex items-center gap-1.5 px-2.5"
            >
              <CharacterIcon name={char} size={16} />
              <span>{char}</span>
            </Button>
          ))}
        </div>
      )}
      <form action={action} className="flex items-end gap-2">
        <input type="hidden" name="moveset" value={moveset} />
        <CharacterSelect
          value={character}
          onChange={attemptSelect}
          name="character"
          placeholder={lang === "es" ? "Elegir personaje" : "Select character"}
        />
        <Button type="submit" size="sm" variant="outline" disabled={!canSubmit}>
          {lang === "es" ? "Elegir" : "Lock in"}
        </Button>
      </form>
      {pendingCharacter !== null && (
        <MovesetDialog
          key={pendingCharacter}
          open
          character={pendingCharacter}
          defaultValue={moveset || defaultMoveset}
          onConfirm={handleMovesetConfirm}
          onCancel={handleMovesetCancel}
          lang={lang}
        />
      )}
    </div>
  );
}
