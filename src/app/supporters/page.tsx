import type { Metadata } from "next";
import { Coffee, Heart } from "lucide-react";
import { prisma } from "@/lib/db";
import { KOFI_URL } from "@/lib/links";
import { getLang } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  alternates: { languages: { "es-MX": "/es" } },
};

export default async function SupportersPage() {
  const lang = await getLang();

  // Only donors who left is_public: true on Ko-fi's end are shown here — see
  // the isPublic comment on the KofiDonation model.
  const donations = await prisma.kofiDonation.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: "desc" },
    take: 100,
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

      <a href={KOFI_URL} target="_blank" rel="noreferrer" className="mt-6 block">
        <Card className="transition-colors hover:border-foreground/30">
          <CardHeader>
            <Coffee className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">
              {lang === "es" ? "Apóyanos en Ko-fi" : "Support us on Ko-fi"}
            </CardTitle>
            <CardDescription>
              {lang === "es"
                ? "Totalmente opcional — no hay ninguna ventaja dentro del sitio atada a esto hoy."
                : "Entirely optional — no in-site perks are tied to it today."}
            </CardDescription>
          </CardHeader>
        </Card>
      </a>

      <div className="mt-8">
        {donations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {lang === "es"
              ? "Todavía no hay colaboradores públicos que mostrar."
              : "No public supporters to show yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {donations.map((d) => (
              <li key={d.id}>
                <Card className="py-0">
                  <CardContent className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.fromName}</p>
                      {d.message && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{d.message}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                      {d.currency} {Number(d.amount).toFixed(2)}
                    </span>
                  </CardContent>
                </Card>
              </li>
            ))}
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
