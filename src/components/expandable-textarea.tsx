"use client";

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// A compact textarea plus a "tap to expand" button that opens the same
// content in a full-height dialog. Both textareas are controlled off one
// piece of state, so typing in either place keeps the other (and the
// form-submitted `name` field, which stays on the compact one) in sync —
// the dialog's copy never needs its own `name`/submission path.
export function ExpandableTextarea({
  name,
  defaultValue = "",
  maxLength,
  rows = 4,
  placeholder,
  className,
  title,
}: {
  name: string;
  defaultValue?: string;
  maxLength: number;
  rows?: number;
  placeholder?: string;
  className: string;
  title: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <textarea
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Expand"
        className="absolute right-2 bottom-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Maximize2 className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>{title}</DialogTitle>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={maxLength}
            placeholder={placeholder}
            autoFocus
            className="mt-3 h-[60dvh] w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring"
          />
          <p className="mt-1.5 text-right text-xs text-muted-foreground tabular-nums">
            {value.length}/{maxLength}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
