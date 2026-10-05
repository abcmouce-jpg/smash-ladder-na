import type { Metadata } from "next";
import { Coffee, Heart } from "lucide-react";
import { prisma } from "@/lib/db";
import { KOFI_URL } from "@/lib/links";
import { getLang } from "@/lib/i18n";
import { getSupporterCount } from "@/lib/public-stats";
import { GOLD_SUPPORTER_MIN_AMOUNT_USD } from "@/lib/supporters";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  alternates: { languages: { "es-MX": "/es" } },
};

export default async function SupportersPage() {
  const [lang, supporterCount] = await Promise.all([getLang(), getSupporterCount()]);

  // Only donors who left is_public: true on Ko-fi's end are shown here — see
  // the isPublic comment on the KofiDonation model. supporterCount above
  // counts everyone (including opted-out donors), so it can run ahead of
  // how many actually show up in the list below.
  const donations = await prisma.kofiDonation.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Gold donations float to the top regardless of date — a one-off big
  // contribution shouldn't scroll off the page just because it's a few
  // weeks old. Stable sort keeps createdAt desc as the tiebreaker within
  // each tier since the query above already produced that order.
  const sortedDonations = [...donations].sort((a, b) => {
    const aGold = Number(a.amount) >= GOLD_SUPPORTER_MIN_AMOUNT_USD ? 1 : 0;
    const bGold = Number(b.amount) >= GOLD_SUPPORTER_MIN_AMOUNT_USD ? 1 : 0;
    return bGold - aGold;
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Heart className="size-6 text-primary" />
        {lang === "es" ? "Colaboradores" : "Supporters"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {lang === "es"
          ? "Hosting y dominio se pagan de nuestro bolsillo — estas son las personas que ayudan a cubrirlo."
          : "Hosting and domain costs come out of pocket — these are the people who help cover that."}
      </p>
      {supporterCount > 0 && (
        <p className="mt-1 text-sm font-medium text-foreground">
          {lang === "es"
            ? supporterCount === 1
              ? "1 persona ha colaborado hasta ahora."
              : `${supporterCount} personas han colaborado hasta ahora.`
            : `${supporterCount} ${supporterCount === 1 ? "person has" : "people have"} chipped in so far.`}
        </p>
      )}

      <a href={KOFI_URL} target="_blank" rel="noreferrer" className="mt-6 block">
        <Card className="transition-colors hover:border-foreground/30">
          <CardHeader>
            <Coffee className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">{lang === "es" ? "Apóyanos en Ko-fi" : "Support us on Ko-fi"}</CardTitle>
            <CardDescription>
              {lang === "es"
                ? "Pega tu código de colaborador (en Ajustes) en el mensaje de la donación para quitar los anuncios y obtener la insignia de colaborador."
                : "Paste your supporter code (in Settings) into the donation message to remove ads and get the supporter badge."}
            </CardDescription>
          </CardHeader>
        </Card>
      </a>

      <div className="mt-8">
        {donations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {lang === "es" ? "Todavía no hay colaboradores públicos que mostrar." : "No public supporters to show yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedDonations.map((d) => {
              const isGold = Number(d.amount) >= GOLD_SUPPORTER_MIN_AMOUNT_USD;
              return (
                <li key={d.id}>
                  <Card className={isGold ? "border-amber-500/40 py-0" : "py-0"}>
                    <CardContent className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {isGold && "🏆 "}
                          {d.fromName}
                        </p>
                        {d.message && <p className="mt-0.5 text-sm text-muted-foreground">{d.message}</p>}
                      </div>
                      <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                        {d.currency} {Number(d.amount).toFixed(2)}
                      </span>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-8">
        <Button asChild variant="outline" size="sm">
          <a href={KOFI_URL} target="_blank" rel="noreferrer">
            <Coffee className="size-3.5" />
            {lang === "es" ? "Ir a Ko-fi" : "Go to Ko-fi"}
          </a>
        </Button>
      </div>
    </main>
  );
}
