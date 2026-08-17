export type Theme = "light" | "dark" | "auto";

// Explicit light/dark/auto stays stored. Nothing stored (a first-time
// visitor) defaults to "auto" — follow the OS preference — matching the
// inline anti-FOUC script in layout.tsx.
export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem("theme");
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch {
    /* localStorage unavailable */
  }
  return "auto";
}

export function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
