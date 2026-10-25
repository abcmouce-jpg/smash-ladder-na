"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from "@/app/settings/actions";
import { getPushSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

type Status = { kind: "error" | "info"; text: string } | null;

export function PushNotificationsForm({ defaultEnabled, lang }: { defaultEnabled: boolean; lang: Lang }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [needsHomeScreenInstall, setNeedsHomeScreenInstall] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supportedNow = isPushSupported();
      const sub = supportedNow ? await getPushSubscription() : null;
      if (cancelled) return;
      setSupported(supportedNow);
      setEnabled(!!sub);
      setNeedsHomeScreenInstall(
        /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setStatus(null);
    try {
      const result = await subscribeToPush();
      if ("error" in result) {
        setStatus({ kind: "error", text: result.error });
        return;
      }
      const { endpoint, keys } = result.subscription.toJSON();
      const saved = await savePushSubscriptionAction({
        endpoint: endpoint ?? "",
        p256dh: keys?.p256dh ?? "",
        auth: keys?.auth ?? "",
      });
      if (!saved.success) throw new Error("Failed to save subscription");
      setEnabled(true);
      setStatus({
        kind: "info",
        text:
          tr(lang, { en: "Notifications enabled for this browser.", es: "Notificaciones activadas para este navegador.", ja: "このブラウザで通知を有効にしました。" }),
      });
    } catch {
      setStatus({
        kind: "error",
        text: tr(lang, { en: "Something went wrong — try again.", es: "Algo salió mal — inténtalo de nuevo.", ja: "問題が発生しました。もう一度お試しください。" }),
      });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setStatus(null);
    try {
      const result = await sendTestPushAction();
      if (result.error) {
        setStatus({ kind: "error", text: result.error });
        return;
      }
      setStatus({
        kind: "info",
        text: tr(lang, { en: "Test notification sent — check your devices.", es: "Notificación de prueba enviada.", ja: "テスト通知を送信しました。端末を確認してください。" }),
      });
    } catch {
      setStatus({
        kind: "error",
        text: tr(lang, { en: "Something went wrong — try again.", es: "Algo salió mal — inténtalo de nuevo.", ja: "問題が発生しました。もう一度お試しください。" }),
      });
    } finally {
      setTesting(false);
    }
  }

  async function disable() {
    setBusy(true);
    setStatus(null);
    try {
      const subscription = await unsubscribeFromPush();
      if (subscription) {
        await removePushSubscriptionAction(subscription.endpoint);
      }
      setEnabled(false);
      setStatus({
        kind: "info",
        text:
          tr(lang, { en: "Notifications disabled for this browser.", es: "Notificaciones desactivadas para este navegador.", ja: "このブラウザの通知を無効にしました。" }),
      });
    } catch {
      setStatus({
        kind: "error",
        text: tr(lang, { en: "Something went wrong — try again.", es: "Algo salió mal — inténtalo de nuevo.", ja: "問題が発生しました。もう一度お試しください。" }),
      });
    } finally {
      setBusy(false);
    }
  }

  if (supported === null) {
    return (
      <div className="flex items-end justify-between gap-2">
        <div className="text-sm">
          <p>{tr(lang, { en: "Push notifications when matched", es: "Notificaciones al ser emparejado", ja: "マッチ時のプッシュ通知" })}</p>
        </div>
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex items-end justify-between gap-2">
      <div className="text-sm">
        <p>{tr(lang, { en: "Push notifications when matched", es: "Notificaciones al ser emparejado", ja: "マッチ時のプッシュ通知" })}</p>
        <p className="mt-1 text-xs font-normal text-muted-foreground">
          {tr(lang, { en: "Sends a browser notification when you're paired, so you notice even if the Lobby tab is in the background or your phone is locked.", es: "Envía una notificación del navegador cuando te emparejen, para que te enteres aunque la pestaña de la Sala esté en segundo plano o tu teléfono esté bloqueado.", ja: "対戦相手が決まったときにブラウザの通知を送ります。ロビーのタブを裏に回していても気づけます。" })}
        </p>
        {supported === false && (
          <p className="mt-1 text-xs text-muted-foreground">
            {tr(lang, { en: "Push notifications aren't supported in this browser.", es: "Este navegador no admite notificaciones push.", ja: "このブラウザはプッシュ通知に対応していません。" })}
          </p>
        )}
        {needsHomeScreenInstall && (
          <p className="mt-1 text-xs text-muted-foreground">
            {tr(lang, { en: "On iPhone/iPad, add the site to your Home Screen first — notifications only work from the installed app.", es: "En iPhone/iPad, añade el sitio a la pantalla de inicio primero — las notificaciones solo funcionan desde la app instalada.", ja: "iPhone / iPad では、先にサイトをホーム画面に追加してください。通知はインストールしたアプリからのみ動作します。" })}
          </p>
        )}
        {status && (
          <p className={`mt-1 text-xs ${status.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {status.text}
          </p>
        )}
      </div>
      {supported && (
        <div className="flex shrink-0 items-center gap-2">
          {enabled && (
            <Button type="button" size="sm" variant="outline" onClick={sendTest} disabled={busy || testing}>
              {testing && <Loader2 className="size-4 animate-spin" />}
              {testing ? (tr(lang, { en: "Sending…", es: "Enviando…", ja: "送信中…" })) : tr(lang, { en: "Test", es: "Probar", ja: "テスト送信" })}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant={enabled ? "outline" : "default"}
            onClick={enabled ? disable : enable}
            disabled={busy || testing}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy
              ? tr(lang, { en: "Saving…", es: "Guardando…", ja: "保存中…" })
              : enabled
                ? tr(lang, { en: "Disable", es: "Desactivar", ja: "無効にする" })
                : tr(lang, { en: "Enable", es: "Activar", ja: "有効にする" })}
          </Button>
        </div>
      )}
    </div>
  );
}
