"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export type OptionSelectOption = {
  value: string;
  label: string;
  /** Optional section heading shown above the option, mirroring <optgroup>. */
  group?: string;
};

/**
 * A themed dropdown styled to match the character option select
 * (CharacterSelect) — same trigger, popover, and item treatments, and it
 * inherits the site font. Optionally searchable (for long lists like the
 * region picker); short preset lists can leave it off.
 *
 * Form-integrated: pass `name` (+ optionally `defaultValue`) and the
 * component renders a hidden native <select> so the value is submitted with
 * the parent <form> (server actions or plain GET forms). Like CharacterSelect,
 * pass `key` at the call site to remount when an external defaultValue change
 * needs to re-sync the internal state.
 */
export function OptionSelect({
  name,
  defaultValue = "",
  options,
  placeholder = "Select…",
  clearLabel,
  className,
  searchable = false,
  searchPlaceholder = "Search…",
  autoSubmit = false,
}: {
  name: string;
  defaultValue?: string;
  options: OptionSelectOption[];
  placeholder?: string;
  /** When set, pins a value="" option at the top that clears the selection —
   *  e.g. "All regions" or "Not set". */
  clearLabel?: string;
  className?: string;
  /** When true, shows a search box in the dropdown that filters options by
   *  label (and group heading, so e.g. "USA" surfaces a whole section). */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** When true, submits the enclosing form as soon as a selection changes,
   *  instead of waiting for a separate Submit click. The hidden <select>
   *  below is controlled entirely by React state (see the onChange no-op
   *  comment on it), so its value never changes via a real user interaction
   *  with that element — a plain `<form onChange>` on the ancestor would
   *  never see a native change event bubble up from it. Submitting
   *  explicitly here, from a `value` effect instead of inside `select()`
   *  itself, is what makes this reliable: it fires only after the state
   *  update has actually re-rendered the hidden select's DOM value, so
   *  requestSubmit() picks up the new selection rather than racing ahead of
   *  it. */
  autoSubmit?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isFirstRender = useRef(true);

  const selected = options.find((opt) => opt.value === value);
  const display = selected?.label ?? placeholder ?? clearLabel;

  const filtered = searchable && query
    ? options.filter((opt) =>
        `${opt.label} ${opt.group ?? ""}`.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

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
    if (open && searchable) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, searchable]);

  const select = useCallback((next: string) => {
    setValue(next);
    setOpen(false);
    setQuery("");
  }, []);

  // Only fires on a genuine change after mount — not for the initial
  // defaultValue, and not for remounts via the `key` prop callers use to
  // re-sync from a new server-side defaultValue (that's a re-mount, so
  // isFirstRender starts true again there too).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (autoSubmit) {
      containerRef.current?.closest("form")?.requestSubmit();
    }
  }, [value, autoSubmit]);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      {/* Hidden native select for form integration */}
      <select
        name={name}
        value={value}
        onChange={() => {}} // value only ever changes via select() below; this just quiets React's controlled-without-onChange warning
        className="hidden"
        tabIndex={-1}
        aria-hidden
      >
        <option value="" />
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} />
        ))}
      </select>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none hover:bg-muted/50 focus-visible:border-ring ${
          value === "" ? "text-muted-foreground" : ""
        }`}
      >
        <span className="flex-1 truncate text-left">{display}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-72 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md">
          {searchable && (
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          )}

          <ul role="listbox" className="max-h-80 overflow-y-auto py-1">
            {clearLabel && !query && (
              <li>
                <button
                  type="button"
                  onClick={() => select("")}
                  className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground ${
                    value === "" ? "bg-primary/10 font-medium text-primary" : "text-foreground"
                  }`}
                >
                  <span className="flex-1">{clearLabel}</span>
                  {value === "" && <Check className="size-3.5 shrink-0 text-primary" />}
                </button>
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-muted-foreground">
                No options match &ldquo;{query}&rdquo;
              </li>
            ) : (
              filtered.map((opt, i) => {
                const showHeader = opt.group !== undefined && opt.group !== filtered[i - 1]?.group;
                return (
                  <Fragment key={opt.value}>
                    {showHeader && (
                      <li className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                        {opt.group}
                      </li>
                    )}
                    <li>
                      <button
                        type="button"
                        onClick={() => select(opt.value)}
                        className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground ${
                          opt.value === value ? "bg-primary/10 font-medium text-primary" : "text-foreground"
                        }`}
                      >
                        <span className="flex-1">{opt.label}</span>
                        {opt.value === value && <Check className="size-3.5 shrink-0 text-primary" />}
                      </button>
                    </li>
                  </Fragment>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
