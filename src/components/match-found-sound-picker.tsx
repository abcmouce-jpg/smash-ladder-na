"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/option-select";
import { playMatchFoundSound, type MatchFoundSound } from "@/lib/sound";
import type { Lang } from "@/lib/i18n";

// Client wrapper for the match-found sound setting: tracks the dropdown's
// selection so the Preview button can play the chosen sound in the browser
// (playMatchFoundSound uses Web Audio / <audio>, which a server action
// can't do). The selection itself still submits with the surrounding form
// via OptionSelect's hidden field.
export function MatchFoundSoundPicker({ defaultValue, lang }: { defaultValue: MatchFoundSound; lang: Lang }) {
  const [value, setValue] = useState<MatchFoundSound>(defaultValue);

  return (
    <div className="flex items-center gap-2">
      <OptionSelect
        key={defaultValue}
        name="matchFoundSound"
        defaultValue={defaultValue}
        onChange={(v) => setValue(v as MatchFoundSound)}
        className="w-48"
        options={[
          { value: "CHIME", label: lang === "es" ? "Tono original" : "Original chime" },
          { value: "ANNOUNCER", label: lang === "es" ? "Anuncio de voz" : "Announcer voice clip" },
        ]}
      />
      <Button type="button" size="sm" variant="outline" onClick={() => playMatchFoundSound(value)}>
        {lang === "es" ? "Probar" : "Preview"}
      </Button>
    </div>
  );
}
