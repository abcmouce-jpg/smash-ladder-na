"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Search, Check, ChevronDown, X } from "lucide-react";
import { CharacterIcon } from "@/components/character-icon";
import { SMASH_CHARACTERS, MAX_FREE_BATTLE_CHARACTERS } from "@/lib/characters";

/**
 * Multi-value sibling of CharacterSelect — same searchable dropdown, but
 * toggling an item adds/removes it instead of replacing the selection, and
 * the dropdown stays open across picks. Selected characters submit as
 * repeated `name` entries (read with `formData.getAll(name)`), one hidden
 * checkbox per selection rather than a single hidden multi-`<select>`, since
 * that's simpler to keep in sync with an array of strings.
 */
export function CharacterMultiSelect({
  name,
  defaultValue = [],
  placeholder = "Select characters",
  className,
}: {
  name: string;
  defaultValue?: string[];
  placeholder?: string;
  className?: string;
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const roster = SMASH_CHARACTERS;
  const filtered = query ? roster.filter((c) => c.toLowerCase().includes(query.toLowerCase())) : roster;
  const atLimit = selected.length >= MAX_FREE_BATTLE_CHARACTERS;

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

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const toggle = useCallback((char: string) => {
    setSelected((prev) => {
      if (prev.includes(char)) return prev.filter((c) => c !== char);
      if (prev.length >= MAX_FREE_BATTLE_CHARACTERS) return prev;
      return [...prev, char];
    });
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className ?? "w-48"}`}>
      {selected.map((c) => (
        <input key={c} type="hidden" name={name} value={c} />
      ))}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-8 w-full cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none hover:bg-muted/50 focus-visible:border-ring ${
          selected.length === 0 ? "text-muted-foreground" : ""
        }`}
      >
        {selected.length === 0 ? (
          <span className="flex-1 truncate text-left">{placeholder}</span>
        ) : (
          <span className="flex flex-1 items-center gap-1 overflow-hidden">
            {selected.slice(0, 4).map((c) => (
              <CharacterIcon key={c} name={c} size={18} />
            ))}
            {selected.length > 4 && (
              <span className="text-xs text-muted-foreground">+{selected.length - 4}</span>
            )}
          </span>
        )}
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md">
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

          {atLimit && (
            <p className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
              Up to {MAX_FREE_BATTLE_CHARACTERS} — remove one to add another.
            </p>
          )}

          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-muted-foreground">
                No characters match &ldquo;{query}&rdquo;
              </li>
            ) : (
              filtered.map((char) => {
                const isSelected = selected.includes(char);
                const disabled = !isSelected && atLimit;
                return (
                  <li key={char}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggle(char)}
                      className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
                        isSelected ? "bg-primary/10 font-medium text-primary" : "text-foreground"
                      }`}
                    >
                      <CharacterIcon name={char} size={18} />
                      <span className="flex-1">{char}</span>
                      {isSelected && <Check className="size-3.5 shrink-0 text-primary" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}

      {selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selected.map((c) => (
            <span
              key={c}
              className="flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
            >
              {c}
              <button
                type="button"
                onClick={() => toggle(c)}
                className="cursor-pointer text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${c}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
