"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MOVESET_PATTERN } from "@/lib/characters";
import type { Lang } from "@/lib/i18n";

// Collects a Mii's 4-digit moveset (each digit 1-4) right after picking one
// of the 3 Mii characters. Validation is blocking, not keystroke-filtering:
// the input accepts anything, and an invalid value shows an inline error on
// confirm rather than silently rejecting characters as they're typed.
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

  // Re-seed from defaultValue every time the dialog opens (e.g. re-picking a
  // Mii should offer whatever moveset is already staged, or the last one
  // used for a Mii earlier in this set — see lastUsedMoveset).
  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setError(null);
    }
  }, [open, defaultValue]);

  function handleConfirm() {
    if (!MOVESET_PATTERN.test(value)) {
      setError(
        lang === "es"
          ? "Ingresa 4 dígitos, cada uno del 1 al 4 (ej: 1221)."
          : "Enter 4 digits, each 1-4 (e.g. 1221).",
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
          {lang === "es" ? `Moveset de ${character ?? ""}` : `${character ?? ""} moveset`}
        </DialogTitle>
        <DialogDescription className="mt-1">
          {lang === "es"
            ? "Ingresa el moveset personalizado como 4 dígitos, cada uno del 1 al 4 (ej: 1221). Tu rival lo verá junto al nombre del personaje."
            : "Enter the custom moveset as 4 digits, each 1-4 (e.g. 1221). Your opponent will see it next to the character name."}
        </DialogDescription>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="1221"
          maxLength={4}
          className="mt-3 h-8 w-24 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {lang === "es" ? "Cancelar" : "Cancel"}
          </Button>
          <Button type="button" size="sm" onClick={handleConfirm}>
            {lang === "es" ? "Confirmar" : "Confirm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
