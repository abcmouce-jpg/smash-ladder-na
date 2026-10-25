import Link from "next/link";
import { Coffee } from "lucide-react";
import { DISCORD_SERVER_URL } from "@/lib/links";
import { getLang } from "@/lib/i18n";
import { getSupporterCount } from "@/lib/public-stats";
import { SITE_NAME } from "@/lib/site";
import { tr } from "@/lib/lang";

export async function SiteFooter() {
  const [lang, supporterCount] = await Promise.all([getLang(), getSupporterCount()]);

  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:py-4">
        <p>
          {tr(lang, {
            en: `${SITE_NAME} — an independent, fan-run community project. Not affiliated with Nintendo.`,
            es: `${SITE_NAME} — un proyecto comunitario independiente, hecho por fans. No afiliado a Nintendo.`,
            ja: `${SITE_NAME} はファンが運営する非公式のコミュニティプロジェクトです。任天堂とは一切関係ありません。`,
          })}
        </p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/about" prefetch={false} className="hover:text-foreground hover:underline">
            {tr(lang, {
              en: "About",
              es: "Acerca de",
              ja: "このサイトについて",
            })}
          </Link>
          <Link href="/rules" prefetch={false} className="hover:text-foreground hover:underline">
            {tr(lang, { en: "Rules", es: "Reglas", ja: "ルール" })}
          </Link>
          <Link href="/faq" prefetch={false} className="hover:text-foreground hover:underline">
            Q&amp;A
          </Link>
          <Link href="/privacy" prefetch={false} className="hover:text-foreground hover:underline">
            {tr(lang, { en: "Privacy", es: "Privacidad", ja: "プライバシー" })}
          </Link>
          <Link href="/terms" prefetch={false} className="hover:text-foreground hover:underline">
            {tr(lang, { en: "Terms", es: "Términos", ja: "利用規約" })}
          </Link>
          <a
            href={DISCORD_SERVER_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground hover:underline"
          >
            Discord
          </a>
          <Link
            href="/supporters"
            prefetch={false}
            className="flex items-center gap-1 hover:text-foreground hover:underline"
          >
            <Coffee className="size-3.5" />
            {tr(lang, { en: "Support us", es: "Apóyanos", ja: "支援する" })}
            {supporterCount > 0 && ` · ${supporterCount}`}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
