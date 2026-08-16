"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Search, Check, ChevronDown } from "lucide-react";
import { CharacterIcon } from "@/components/character-icon";
import { SMASH_CHARACTERS } from "@/lib/characters";
import type { SmashCharacter } from "@/lib/characters";

/**
 * A searchable character picker that displays each fighter's stock icon next
 * to their name.
 *
 * Two usage modes:
 * 1. **Controlled** — pass `value` + `onChange` (no `name`).
 * 2. **Form-integrated** — pass `name` (and optionally `defaultValue`). The
 *    component manages its own selection state and renders a hidden native
 *    `<select>` so the value is submitted with the parent <form>.
 */
export function CharacterSelect({
  value,
  onChange,
  defaultValue,
  placeholder = "Select character",
  className,
  name,
  clearLabel,
}: {
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
  placeholder?: string;
  /** Controls the trigger's width (defaults to "w-48"); pass a responsive
   *  value like "w-full sm:w-48" to let it stack full-width on mobile. */
  className?: string;
  /** When set, renders a hidden native <select> with this name so the value
   *  flows into the parent <form>'s FormData (useful with server actions).
   *  In this mode the component manages its own state internally. */
  name?: string;
  /** When set, pins an extra option at the top of the list that clears the
   *  selection back to none — e.g. "All Characters" for a filter dropdown. */
  clearLabel?: string;
}) {
  // Internal state for form-integrated mode
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  // When controlled (onChange provided), use the passed value; otherwise use internal state
  const isControlled = onChange !== undefined;
  const effectiveValue = isControlled ? (value ?? "") : internalValue;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const roster = SMASH_CHARACTERS;
  const filtered = query ? roster.filter((c) => c.toLowerCase().includes(query.toLowerCase())) : roster;

  const selected = effectiveValue ? (effectiveValue as SmashCharacter) : null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus the search input when the dropdown opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const select = useCallback(
    (char: string) => {
      if (isControlled) {
        onChange(char);
      } else {
        setInternalValue(char);
      }
      setOpen(false);
      setQuery("");
    },
    [isControlled, onChange],
  );

  return (
    <div ref={containerRef} className={`relative ${className ?? "w-48"}`}>
      {/* Hidden native select for form integration */}
      {name && (
        <select
          name={name}
          value={effectiveValue}
          onChange={() => {}} // never touched directly — its value only ever changes via select() below; this just quiets React's controlled-without-onChange warning ("readOnly" isn't a valid <select> attribute)
          className="hidden"
          tabIndex={-1}
          aria-hidden
        >
          <option value="" />
          {roster.map((c) => (
            <option key={c} value={c} />
          ))}
        </select>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none hover:bg-muted/50 focus-visible:border-ring ${
          !selected ? "text-muted-foreground" : ""
        }`}
      >
        {selected ? (
          <>
            <CharacterIcon name={selected} size={18} />
            <span className="flex-1 truncate text-left">{selected}</span>
          </>
        ) : (
          <span className="flex-1 truncate text-left">{placeholder}</span>
        )}
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md">
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search characters…"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
            />
          </div>

          {/* List */}
          <ul className="max-h-60 overflow-y-auto py-1">
            {clearLabel && !query && (
              <li>
                <button
                  type="button"
                  onClick={() => select("")}
                  className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground ${
                    !selected ? "bg-primary/10 font-medium text-primary" : "text-foreground"
                  }`}
                >
                  <span className="flex-1">{clearLabel}</span>
                  {!selected && <Check className="size-3.5 shrink-0 text-primary" />}
                </button>
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-muted-foreground">
                No characters match &ldquo;{query}&rdquo;
              </li>
            ) : (
              filtered.map((char) => (
                <li key={char}>
                  <button
                    type="button"
                    onClick={() => select(char)}
                    className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground ${
                      char === selected ? "bg-primary/10 font-medium text-primary" : "text-foreground"
                    }`}
                  >
                    <CharacterIcon name={char} size={18} />
                    <span className="flex-1">{char}</span>
                    {char === selected && <Check className="size-3.5 shrink-0 text-primary" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
