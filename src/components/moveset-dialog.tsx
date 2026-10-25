"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MOVESET_PATTERN } from "@/lib/characters";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

// Collects a Mii's 4-digit moveset (each digit 1-4) right after picking one
// of the 3 Mii characters. Validation is blocking, not keystroke-filtering:
// the input accepts anything, and an invalid value shows an inline error on
// confirm rather than silently rejecting characters as they're typed.
//
// The caller is expected to mount this component keyed by `character` (or
// otherwise force a remount per pick) so `value`/`error` re-seed from
// `defaultValue` on every fresh open, without needing an effect to
// re-synchronize state.
export function MovesetDialog({
  open,
  character,
  defaultValue,
  onConfirm,
  onCancel,
  lang,
}: {
  open: boolean;
  character: string | null;
  defaultValue: string;
  onConfirm: (moveset: string) => void;
  onCancel: () => void;
  lang: Lang;
}) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    if (!MOVESET_PATTERN.test(value)) {
      setError(
        tr(lang, {
          en: "Enter 4 digits, each 1-4 (e.g. 1221).",
          es: "Ingresa 4 dígitos, cada uno del 1 al 4 (ej: 1221).",
          ja: "1〜4 の数字を 4 桁で入力してください（例: 1221）。",
        }),
      );
      return;
    }
    onConfirm(value);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogTitle>
          {tr(lang, {
            en: `${character ?? ""} moveset`,
            es: `Moveset de ${character ?? ""}`,
            ja: `${character ?? ""} の必殺ワザ`,
          })}
        </DialogTitle>
        <DialogDescription className="mt-1">
          {tr(lang, {
            en: "Enter the custom moveset as 4 digits, each 1-4 (e.g. 1221). Your opponent will see it next to the character name.",
            es: "Ingresa el moveset personalizado como 4 dígitos, cada uno del 1 al 4 (ej: 1221). Tu rival lo verá junto al nombre del personaje.",
            ja: "必殺ワザの組み合わせを 1〜4 の数字 4 桁で入力してください（例: 1221）。対戦相手にはキャラクター名の横に表示されます。",
          })}
        </DialogDescription>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={4}
          className="mt-3 h-8 w-24 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {tr(lang, { en: "Cancel", es: "Cancelar", ja: "キャンセル" })}
          </Button>
          <Button type="button" size="sm" onClick={handleConfirm}>
            {tr(lang, { en: "Confirm", es: "Confirmar", ja: "決定" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
