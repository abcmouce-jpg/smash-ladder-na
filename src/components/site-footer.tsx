import Link from "next/link";
import { Coffee } from "lucide-react";
import { DISCORD_SERVER_URL } from "@/lib/links";
import { getLang } from "@/lib/i18n";

export async function SiteFooter() {
  const lang = await getLang();

  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-6 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:py-4">
        <p>
          {lang === "es"
            ? "Smash Ladder NA — un proyecto comunitario independiente, hecho por fans. No afiliado a Nintendo."
            : "Smash Ladder NA — an independent, fan-run community project. Not affiliated with Nintendo."}
        </p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/about" prefetch={false} className="hover:text-foreground hover:underline">
            {lang === "es" ? "Acerca de" : "About"}
          </Link>
          <Link href="/rules" prefetch={false} className="hover:text-foreground hover:underline">
            {lang === "es" ? "Reglas" : "Rules"}
          </Link>
          <Link href="/faq" prefetch={false} className="hover:text-foreground hover:underline">
            Q&amp;A
          </Link>
          <Link href="/privacy" prefetch={false} className="hover:text-foreground hover:underline">
            {lang === "es" ? "Privacidad" : "Privacy"}
          </Link>
          <Link href="/terms" prefetch={false} className="hover:text-foreground hover:underline">
            {lang === "es" ? "Términos" : "Terms"}
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
            {lang === "es" ? "Apóyanos" : "Support us"}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
