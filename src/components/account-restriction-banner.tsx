import { Ban, Clock } from "lucide-react";
import { auth } from "@/auth";
import { getAccountRestriction } from "@/lib/account";
import { getLang } from "@/lib/i18n";
import { tr, trNode } from "@/lib/lang";
import { DISCORD_SERVER_URL } from "@/lib/links";

// Site-wide notice for a banned or suspended account.
//
// Without this the only thing a restricted player ever saw was a server
// action failing: requireNotBanned throws, Next.js strips the message in
// production, and they get an opaque error digest. Players reasonably read
// that as the site being broken rather than as a moderation decision — and
// mods had no way to tell whether the person had even been informed. This
// says it plainly, on every page, before they click anything.
export async function AccountRestrictionBanner() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [restriction, lang] = await Promise.all([getAccountRestriction(session.user.id), getLang()]);
  if (!restriction) return null;

  const banned = restriction.status === "BANNED";
  const Icon = banned ? Ban : Clock;

  const title = banned
    ? tr(lang, {
        en: "Your account has been banned",
        es: "Tu cuenta está suspendida permanentemente",
        ja: "アカウントは永久停止されています",
      })
    : tr(lang, {
        en: "Your account is temporarily restricted",
        es: "Tu cuenta está restringida temporalmente",
        ja: "アカウントは一時的に制限されています",
      });

  const body = banned
    ? tr(lang, {
        en: "You can't join the lobby, play ranked matches, or post. This is a moderation decision, not a site error.",
        es: "No puedes entrar a la sala, jugar partidas clasificatorias ni publicar. Esto es una decisión de moderación, no un error del sitio.",
        ja: "ロビーへの参加、ランク戦、投稿ができません。これはモデレーションによる措置で、サイトの不具合ではありません。",
      })
    : tr(lang, {
        en: "Some features are limited for now. This is a moderation decision, not a site error.",
        es: "Algunas funciones están limitadas por ahora. Esto es una decisión de moderación, no un error del sitio.",
        ja: "現在、一部の機能が制限されています。これはモデレーションによる措置で、サイトの不具合ではありません。",
      });

  const discordLink = (
    <a href={DISCORD_SERVER_URL} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
      Discord
    </a>
  );

  return (
    <div className="border-b border-destructive/30 bg-destructive/10">
      <div className="mx-auto flex w-full max-w-5xl items-start gap-3 px-6 py-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-destructive">{title}</p>
          <p className="mt-1 text-muted-foreground">{body}</p>
          {restriction.until && (
            <p className="mt-1 text-muted-foreground">
              {tr(lang, { en: "Until: ", es: "Hasta: ", ja: "期限：" })}
              <time dateTime={restriction.until.toISOString()}>
                {restriction.until.toLocaleString(tr(lang, { en: "en-US", es: "es-MX", ja: "ja-JP" }), { dateStyle: "medium", timeStyle: "short" })}
              </time>
            </p>
          )}
          {restriction.reason && (
            <p className="mt-1 break-words text-muted-foreground">
              {tr(lang, { en: "Reason: ", es: "Motivo: ", ja: "理由：" })}
              <span className="text-foreground">{restriction.reason}</span>
            </p>
          )}
          <p className="mt-1 text-muted-foreground">
            {trNode(lang, {
              en: (
                <>
                  Think this is a mistake? Reach a mod on {discordLink}.
                </>
              ),
              es: <>¿Crees que es un error? Contáctanos en {discordLink}.</>,
              ja: <>誤りだと思う場合は、{discordLink}でモデレーターに連絡してください。</>,
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
