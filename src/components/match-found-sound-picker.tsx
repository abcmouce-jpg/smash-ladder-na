"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/option-select";
import { playMatchFoundSound, type MatchFoundSound } from "@/lib/sound";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

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
          { value: "CHIME", label: tr(lang, { en: "Original chime", es: "Tono original", ja: "元のチャイム" }) },
          {
            value: "ANNOUNCER",
            label: tr(lang, { en: "Announcer voice clip", es: "Anuncio de voz", ja: "アナウンス音声" }),
          },
        ]}
      />
      <Button type="button" size="sm" variant="outline" onClick={() => playMatchFoundSound(value)}>
        {tr(lang, { en: "Preview", es: "Probar", ja: "試聴" })}
      </Button>
    </div>
  );
}
