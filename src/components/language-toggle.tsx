"use client";

import { cn } from "@/lib/utils";

// Visible EN/ES segmented toggle for the header — the two supported
// languages get a one-click switch instead of hiding behind a menu. The
// server actions are bound by the (server) header and passed down so this
// stays a dumb client component.
export function LanguageToggle({
  lang,
  enAction,
  esAction,
}: {
  lang: "en" | "es";
  enAction: () => Promise<void>;
  esAction: () => Promise<void>;
}) {
  return (
    <div
      role="group"
      aria-label="Language"
      className="flex shrink-0 items-center overflow-hidden rounded-lg border border-border text-xs font-medium"
    >
      <form action={enAction}>
        <button
          type="submit"
          aria-pressed={lang === "en"}
          title="English"
          className={cn(
            "cursor-pointer px-1.5 py-1 transition-colors",
            lang === "en"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          EN
        </button>
      </form>
      <form action={esAction}>
        <button
          type="submit"
          aria-pressed={lang === "es"}
          title="Español"
          className={cn(
            "cursor-pointer px-1.5 py-1 transition-colors",
            lang === "es"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          ES
        </button>
      </form>
    </div>
  );
}
