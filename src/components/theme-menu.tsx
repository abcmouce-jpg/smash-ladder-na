"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useLayoutEffect, useState } from "react";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEME_OPTIONS: { value: Theme; label: { en: string; es: string }; icon: typeof Sun }[] = [
  { value: "light", label: { en: "Light", es: "Claro" }, icon: Sun },
  { value: "dark", label: { en: "Dark", es: "Oscuro" }, icon: Moon },
  { value: "auto", label: { en: "Auto", es: "Automático" }, icon: Monitor },
];

// Compact theme picker for the header. A single cycling toggle is the most
// common pattern but hides two of the three modes (light/dark/auto) behind a
// click-and-see-what-happens loop, so this is an explicit menu with a
// checkmark on the active mode instead — same underlying storage/apply logic
// as the old ThemeToggle.
export function ThemeMenu({ lang = "en" }: { lang?: "en" | "es" }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") return getStoredTheme();
    return "auto";
  });

  // Sync the DOM after every render, before paint.
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const choose = useCallback((next: Theme) => {
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  }, []);

  const ActiveIcon = THEME_OPTIONS.find((o) => o.value === theme)?.icon ?? Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={lang === "es" ? "Cambiar tema" : "Change theme"}
          title={lang === "es" ? "Tema" : "Theme"}
          className="text-muted-foreground hover:text-foreground"
        >
          <ActiveIcon className="size-3.5" suppressHydrationWarning />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = option.value === theme;
          return (
            <DropdownMenuItem key={option.value} onSelect={() => choose(option.value)}>
              <Icon className="size-3.5" />
              <span className="flex-1">{lang === "es" ? option.label.es : option.label.en}</span>
              <Check className={cn("size-3.5", active ? "opacity-100" : "opacity-0")} aria-hidden />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
