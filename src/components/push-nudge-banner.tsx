"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { savePushSubscriptionAction } from "@/app/settings/actions";
import { getPushSubscription, isPushSupported, subscribeToPush } from "@/lib/push-client";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

const DISMISSED_KEY = "pushNudgeDismissed";

// Shown on the Lobby page to nudge signed-in players toward turning on push
// — the toggle living only in Settings meant almost nobody found it (10 of
// 3175 accounts ever enabled it, zero of the top 20 by rating), so anyone
// who's tabbed away or closed their browser while waiting has no way to
// know they've been matched except the in-tab chime, which needs the tab
// to still be alive. This is the highest-intent moment to ask: right where
// someone's about to sit in a queue.
export function PushNudgeBanner({ lang }: { lang: Lang }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
      if (localStorage.getItem(DISMISSED_KEY)) return;
      if (!isPushSupported()) return;
      const sub = await getPushSubscription();
      if (cancelled) return;
      if (!sub) setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const result = await subscribeToPush();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const { endpoint, keys } = result.subscription.toJSON();
      const saved = await savePushSubscriptionAction({
        endpoint: endpoint ?? "",
        p256dh: keys?.p256dh ?? "",
        auth: keys?.auth ?? "",
      });
      if (!saved.success) throw new Error("Failed to save subscription");
      dismiss();
    } catch {
      setError(
        tr(lang, {
          en: "Something went wrong — try again.",
          es: "Algo salió mal — inténtalo de nuevo.",
          ja: "問題が発生しました。もう一度お試しください。",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="mt-3 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <BellRing className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p>
          {tr(lang, {
            en: "Turn on notifications so you don't miss your match if you close this tab or lock your phone.",
            es: "Activa las notificaciones para no perderte tu emparejamiento si cierras esta pestaña o bloqueas tu teléfono.",
            ja: "通知をオンにすると、このタブを閉じたりスマホをロックしたりしてもマッチを見逃しません。",
          })}
        </p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        <div className="mt-2 flex items-center gap-2">
          <Button type="button" size="sm" onClick={enable} disabled={busy}>
            {busy
              ? tr(lang, { en: "Enabling…", es: "Activando…", ja: "設定中…" })
              : tr(lang, { en: "Enable notifications", es: "Activar notificaciones", ja: "通知をオンにする" })}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={dismiss} disabled={busy}>
            {tr(lang, { en: "Not now", es: "Ahora no", ja: "あとで" })}
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={tr(lang, { en: "Dismiss", es: "Cerrar", ja: "閉じる" })}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
