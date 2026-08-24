"use client";

import { useEffect, useState } from "react";
import { Coffee, X } from "lucide-react";
import { KOFI_URL } from "@/lib/links";
import type { Lang } from "@/lib/i18n";

const DISMISSED_AT_KEY = "supporterBannerDismissedAt";
// Unlike PushNudgeBanner's permanent dismiss, this is asking for money, not
// a one-time setup step — worth a periodic re-ask rather than going silent
// for good after the first close.
const RESHOW_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export function SupporterBanner({ supporterCount, lang }: { supporterCount: number; lang: Lang }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Deferred a tick so this doesn't trigger react-hooks/set-state-in-effect's
    // cascading-render warning — same async-callback shape as
    // push-nudge-banner's and JoinLobbyForm's mount checks.
    queueMicrotask(() => {
      const dismissedAt = Number(localStorage.getItem(DISMISSED_AT_KEY) ?? 0);
      setVisible(Date.now() - dismissedAt > RESHOW_AFTER_MS);
    });
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <Coffee className="size-4 shrink-0 text-primary" />
      <a href={KOFI_URL} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:underline">
        {lang === "es"
          ? supporterCount > 0
            ? supporterCount === 1
              ? "El hosting lo financia 1 colaborador — ayuda a mantenerlo en pie."
              : `El hosting lo financian ${supporterCount} colaboradores — ayuda a mantenerlo en pie.`
            : "El hosting sale de nuestro bolsillo — ayuda a mantenerlo en pie."
          : supporterCount > 0
            ? `Hosting is funded by ${supporterCount} supporter${supporterCount === 1 ? "" : "s"} — help keep it running.`
            : "Hosting costs come out of pocket — help keep it running."}
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label={lang === "es" ? "Cerrar" : "Dismiss"}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
