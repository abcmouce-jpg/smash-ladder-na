"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useLayoutEffect, useState } from "react";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Read-only — no side effects during render.
    if (typeof window !== "undefined") {
      return getStoredTheme();
    }
    return "light";
  });

  // Sync the DOM with the current theme after every render, before the browser
  // paints. This is the correct place for DOM mutations that depend on state.
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : prev === "dark" ? "auto" : "light";
      try {
        localStorage.setItem("theme", next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <button
      onClick={toggle}
      suppressHydrationWarning
      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none hover:bg-muted hover:text-foreground"
    >
      {theme === "dark" ? (
        <Moon className="size-3.5" />
      ) : theme === "light" ? (
        <Sun className="size-3.5" />
      ) : (
        <Monitor className="size-3.5" />
      )}
      {theme === "dark" ? "Dark theme" : theme === "light" ? "Light theme" : "Auto theme"}
    </button>
  );
}
