"use client";

import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LANGUAGES = [
  { value: "en", label: "English", short: "EN" },
  { value: "es", label: "Español", short: "ES" },
] as const;

// Language picker for the header. Was a segmented EN/ES toggle; it's a
// dropdown now so adding a third language doesn't keep widening the header
// row. The current choice stays readable on the trigger (and checked in the
// list) rather than hidden behind the menu. The server actions are bound by
// the (server) header and passed down so this stays a dumb client component.
export function LanguageToggle({
  lang,
  enAction,
  esAction,
}: {
  lang: "en" | "es";
  enAction: () => Promise<void>;
  esAction: () => Promise<void>;
}) {
  const actions = { en: enAction, es: esAction };
  const current = LANGUAGES.find((option) => option.value === lang)!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="group text-muted-foreground hover:text-foreground"
          aria-label={lang === "es" ? "Idioma" : "Language"}
          title={lang === "es" ? "Idioma" : "Language"}
        >
          {current.short}
          <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {LANGUAGES.map((option) => (
          <form key={option.value} action={actions[option.value]}>
            <DropdownMenuItem asChild>
              <button
                type="submit"
                lang={option.value}
                className="w-full"
                aria-current={option.value === lang ? "true" : undefined}
              >
                <span className="flex-1 text-left">{option.label}</span>
                <Check className={cn("size-3.5", option.value === lang ? "opacity-100" : "opacity-0")} aria-hidden />
              </button>
            </DropdownMenuItem>
          </form>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
