"use client";

import { useEffect } from "react";
import { applyTheme, getStoredTheme } from "@/lib/theme";

// Always-mounted safety net, separate from ThemeToggle (which only exists
// in the DOM while its dropdown is open, so it can't be relied on to fix
// this itself). The inline anti-FOUC script in layout.tsx already applies
// the stored theme before the first paint, but that only runs once — if
// anything later forces React to touch <html> (e.g. a hydration mismatch
// elsewhere on the page triggering a recovery re-render) the class can get
// silently dropped with nothing to reapply it. This re-syncs on mount to
// close that gap, and re-applies whenever the OS preference changes so an
// "auto" selection follows the browser live.
export function ThemeSync() {
  useEffect(() => {
    const apply = () => applyTheme(getStoredTheme());
    apply();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return null;
}
