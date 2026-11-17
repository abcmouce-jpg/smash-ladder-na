import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Card, CardContent } from "@/components/ui/card";
import { getLang } from "@/lib/i18n";
import { tr } from "@/lib/lang";
import { SITE_NAME, instanceText } from "@/lib/site";
import { weekLabel } from "@/lib/week-label";
import { weekBounds, weeksWithSets, weekIdFor } from "@/lib/weekly-report";

// How many weeks the index offers. Deliberately short: the point of the list
// is the recent run, and every older week still has its own page and its own
// link from the week after it.
const SHOWN = 12;

export const metadata: Metadata = {
  title: `${instanceText({ en: "Weekly reports", es: "Informes semanales" })} — ${SITE_NAME}`,
  description: instanceText({
    en: "A week at a time: how many sets were played, which fighters were picked and how they did, which regions were busy, and who climbed.",
    es: "Semana a semana: cuántas partidas se jugaron, qué personajes se eligieron y cómo les fue, qué regiones estuvieron activas y quién subió.",
  }),
  alternates: { canonical: "/reports" },
};

export default async function WeeklyReportsPage() {
  const lang = await getLang();
  const weeks = await weeksWithSets(SHOWN);
  const currentWeek = weekIdFor(new Date());

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <PageHeading
        icon={CalendarRange}
        title={tr(lang, { en: "Weekly reports", es: "Informes semanales" })}
        description={tr(lang, {
          en: "One page per week of the ladder, written from the sets themselves.",
          es: "Una página por semana de la clasificación, escrita a partir de las propias partidas.",
        })}
      />

      <p className="mt-6 text-sm text-muted-foreground">
        {tr(lang, {
          en: `Each report counts the sets confirmed that week and nothing else: how many were played and by how many people, which fighters were picked and how often they won, which regions were at the table, and the biggest rating moves. Weeks run Monday to Sunday.`,
          es: `Cada informe cuenta las partidas confirmadas de esa semana y nada más: cuántas se jugaron y entre cuántas personas, qué personajes se eligieron y con qué frecuencia ganaron, qué regiones estuvieron presentes y los mayores cambios de clasificación. Las semanas van de lunes a domingo.`,
        })}
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {weeks.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {tr(lang, { en: "No weeks to report on yet.", es: "Todavía no hay semanas que informar." })}
          </p>
        )}
        {weeks.map((week) => {
          const bounds = weekBounds(week.id);
          if (!bounds) return null;
          return (
            <Link key={week.id} href={`/reports/${week.id}`}>
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4">
                  <span className="font-medium text-foreground">
                    {weekLabel(bounds.start, bounds.end, lang)}
                    {week.id === currentWeek && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {tr(lang, { en: "in progress", es: "en curso" })}
                      </span>
                    )}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {tr(lang, {
                      en: `${week.sets.toLocaleString("en-US")} sets · ${week.players.toLocaleString("en-US")} players`,
                      es: `${week.sets.toLocaleString("es-MX")} partidas · ${week.players.toLocaleString("es-MX")} jugadores`,
                    })}
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
