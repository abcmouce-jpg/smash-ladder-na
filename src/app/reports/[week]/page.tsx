import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { SectionHeading } from "@/components/section-heading";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { echoGroupLabel, characterSlug, type SmashCharacter } from "@/lib/characters";
import { getLang } from "@/lib/i18n";
import { tr, trNode } from "@/lib/lang";
import { SITE_NAME } from "@/lib/site";
import { LADDER_TIME_ZONE } from "@/lib/timezone";
import { dayLabel, weekLabel } from "@/lib/week-label";
import { getWeeklyReport, recentWeekIds, weekBounds, type WeeklyReport } from "@/lib/weekly-report";

// How many weeks back the archive goes. The ladder's own history is longer,
// but a list has to end somewhere and a year of weeks is already 52 pages.
const ARCHIVE_WEEKS = 52;

const MODE_LABEL: Record<string, { en: string; es: string }> = {
  STANDARD: { en: "ranked", es: "clasificatorias" },
  RANDITTO: { en: "randitto", es: "randitto" },
  RANDUBS: { en: "randubs", es: "randubs" },
};

function n(value: number, lang: string) {
  return value.toLocaleString(lang === "es" ? "es-MX" : "en-US");
}

export async function generateMetadata({ params }: { params: Promise<{ week: string }> }): Promise<Metadata> {
  const { week } = await params;
  const bounds = weekBounds(week);
  if (!bounds) return {};
  const lang = await getLang();
  const label = weekLabel(bounds.start, bounds.end, lang);
  return {
    title: `${tr(lang, { en: `The week of ${label}`, es: `La semana del ${label}` })} — ${SITE_NAME}`,
    description: tr(lang, {
      en: `What happened on the ${SITE_NAME} ladder that week: sets played, fighters picked, win rates, the regions they came from, and who moved the furthest.`,
      es: `Lo que pasó en la clasificación de ${SITE_NAME} esa semana: partidas jugadas, personajes elegidos, tasas de victoria, regiones y quién más se movió.`,
    }),
    alternates: { canonical: `/reports/${week}` },
  };
}

export default async function WeeklyReportPage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const [report, lang] = await Promise.all([getWeeklyReport(week), getLang()]);
  if (!report) notFound();

  const label = weekLabel(report.start, report.end, lang);
  const busiest = [...report.byDay].sort((a, b) => b.sets - a.sets)[0];
  const topCharacters = report.characters.slice(0, 12);
  const topRegions = report.byRegion.slice(0, 8);
  const climbers = report.climbers.filter((line) => line.delta > 0).slice(0, 8);
  const grinders = report.grinders.slice(0, 8);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <PageHeading
        icon={CalendarRange}
        title={tr(lang, { en: `The week of ${label}`, es: `La semana del ${label}` })}
        description={tr(lang, {
          en: `Every number below is counted from confirmed sets on ${SITE_NAME}, Monday to Sunday, ${LADDER_TIME_ZONE.split("/")[1].replace("_", " ")} time.`,
          es: `Cada cifra sale de partidas confirmadas en ${SITE_NAME}, de lunes a domingo, hora de ${LADDER_TIME_ZONE.split("/")[1].replace("_", " ")}.`,
        })}
        action={
          report.complete ? null : (
            <Badge variant="outline">{tr(lang, { en: "Week in progress", es: "Semana en curso" })}</Badge>
          )
        }
      />

      {report.sets === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          {tr(lang, {
            en: "No sets were confirmed during this week.",
            es: "No se confirmó ninguna partida durante esta semana.",
          })}
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-10 text-sm text-muted-foreground">
          <Summary report={report} lang={lang} busiest={busiest} />

          <section>
            <SectionHeading label={tr(lang, { en: "Day by day", es: "Día a día" })} />
            <Card className="mt-3">
              <CardContent className="pt-4">
                <table className="w-full text-left text-sm">
                  <tbody>
                    {report.byDay.map((row) => (
                      <tr key={row.day} className="border-b border-border last:border-0">
                        <td className="py-2 font-medium text-foreground">{dayLabel(row.day, lang)}</td>
                        <td className="py-2 text-right tabular-nums">{n(row.sets, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </section>

          {topCharacters.length > 0 && (
            <section>
              <SectionHeading label={tr(lang, { en: "Fighters picked", es: "Personajes elegidos" })} />
              <p className="mt-2">
                {tr(lang, {
                  en: `${n(report.characterPicks, lang)} character picks were made across ${n(report.games, lang)} decided games. Win rate is that fighter's share of the games it appeared in, counted per pick rather than per player.`,
                  es: `Se hicieron ${n(report.characterPicks, lang)} elecciones de personaje en ${n(report.games, lang)} partidas decididas. La tasa de victorias es la de cada personaje en las partidas en las que apareció, contada por elección y no por jugador.`,
                })}
              </p>
              <Card className="mt-3">
                <CardContent className="overflow-x-auto pt-4">
                  <table className="w-full min-w-[22rem] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="pb-2 font-medium">{tr(lang, { en: "Fighter", es: "Personaje" })}</th>
                        <th className="pb-2 text-right font-medium">{tr(lang, { en: "Games", es: "Partidas" })}</th>
                        <th className="pb-2 text-right font-medium">{tr(lang, { en: "Picks", es: "Elección" })}</th>
                        <th className="pb-2 text-right font-medium">{tr(lang, { en: "Won", es: "Ganadas" })}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCharacters.map((line) => (
                        <tr key={line.character} className="border-t border-border">
                          <td className="py-2 font-medium text-foreground">
                            <Link
                              className="hover:underline"
                              href={`/characters/${characterSlug(line.character as SmashCharacter)}`}
                            >
                              {echoGroupLabel(line.character as SmashCharacter, lang)}
                            </Link>
                          </td>
                          <td className="py-2 text-right tabular-nums">{n(line.games, lang)}</td>
                          <td className="py-2 text-right tabular-nums">{line.pickRate}%</td>
                          <td className="py-2 text-right tabular-nums">
                            {line.winRate === null ? "—" : `${line.winRate}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </section>
          )}

          {topRegions.length > 0 && (
            <section>
              <SectionHeading label={tr(lang, { en: "Where it was played", es: "Dónde se jugó" })} />
              <p className="mt-2">
                {tr(lang, {
                  en: "A set counts once for each region at the table, so a set between two regions appears in both rows.",
                  es: "Una partida cuenta una vez por cada región en la mesa, así que una partida entre dos regiones aparece en ambas filas.",
                })}
              </p>
              <Card className="mt-3">
                <CardContent className="pt-4">
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {topRegions.map((row) => (
                        <tr key={row.region} className="border-b border-border last:border-0">
                          <td className="py-2 font-medium text-foreground">{row.region}</td>
                          <td className="py-2 text-right tabular-nums">{n(row.sets, lang)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </section>
          )}

          {climbers.length > 0 && (
            <section>
              <SectionHeading label={tr(lang, { en: "Biggest climbs", es: "Mayores subidas" })} />
              <p className="mt-2">
                {tr(lang, {
                  en: "Rating gained across the week, summed over every confirmed set. Only players whose rating is public appear here.",
                  es: "Puntos de clasificación ganados durante la semana, sumando cada partida confirmada. Solo aparecen jugadores con clasificación pública.",
                })}
              </p>
              <PlayerTable rows={climbers} lang={lang} showDelta />
            </section>
          )}

          {grinders.length > 0 && (
            <section>
              <SectionHeading label={tr(lang, { en: "Most sets played", es: "Más partidas jugadas" })} />
              <PlayerTable rows={grinders} lang={lang} />
            </section>
          )}

          <section>
            <SectionHeading label={tr(lang, { en: "How this is counted", es: "Cómo se cuenta esto" })} />
            <div className="mt-3 flex flex-col gap-3">
              <p>
                {tr(lang, {
                  en: "A set is counted on the day it was confirmed by both players, not the day it was started, and only confirmed sets count at all — cancelled, expired and disputed ones are left out entirely.",
                  es: "Una partida cuenta el día en que ambos jugadores la confirman, no el día en que empezó, y solo cuentan las confirmadas: las canceladas, caducadas y en disputa quedan fuera.",
                })}
              </p>
              <p>
                {tr(lang, {
                  en: "Echo fighters are folded into the fighter they echo, so one row covers both. A game with no recorded winner is left out of the fighter table but still counted as a set.",
                  es: "Los personajes eco se cuentan con el personaje del que son eco, así que una fila cubre a ambos. Una partida sin ganador registrado queda fuera de la tabla de personajes pero sigue contando como set.",
                })}
              </p>
              <p>
                {trNode(lang, {
                  en: (
                    <>
                      Nothing here is an opinion about the game. These are counts of what was played and what the
                      results were; what any of it means is yours to decide. The live figures are on{" "}
                      <Link className="underline" href="/stats">
                        Stats
                      </Link>
                      .
                    </>
                  ),
                  es: (
                    <>
                      Nada de esto es una opinión sobre el juego. Son recuentos de lo que se jugó y de cómo terminó; lo
                      que signifique lo decides tú. Las cifras en vivo están en{" "}
                      <Link className="underline" href="/stats">
                        Estadísticas
                      </Link>
                      .
                    </>
                  ),
                })}
              </p>
            </div>
          </section>
        </div>
      )}

      <Neighbours week={week} lang={lang} />
    </main>
  );
}

function Summary({
  report,
  lang,
  busiest,
}: {
  report: WeeklyReport;
  lang: "en" | "es";
  busiest: { day: string; sets: number } | undefined;
}) {
  const modes = report.byMode
    .map((row) => `${n(row.sets, lang)} ${tr(lang, MODE_LABEL[row.mode] ?? { en: row.mode, es: row.mode })}`)
    .join(tr(lang, { en: ", ", es: ", " }));

  return (
    <section className="flex flex-col gap-3">
      <p>
        {tr(lang, {
          en: `${n(report.sets, lang)} sets were confirmed this week, made up of ${n(report.games, lang)} games, between ${n(report.players, lang)} players. That breaks down as ${modes}.`,
          es: `Se confirmaron ${n(report.sets, lang)} partidas esta semana, con ${n(report.games, lang)} juegos, entre ${n(report.players, lang)} jugadores. El desglose es ${modes}.`,
        })}
      </p>
      {busiest && busiest.sets > 0 && (
        <p>
          {tr(lang, {
            en: `The busiest day was ${dayLabel(busiest.day, lang)}, with ${n(busiest.sets, lang)} sets.`,
            es: `El día con más actividad fue el ${dayLabel(busiest.day, lang)}, con ${n(busiest.sets, lang)} partidas.`,
          })}
        </p>
      )}
      <p>
        {tr(lang, {
          en: `${n(report.newAccounts, lang)} accounts were created, and ${n(report.debuts, lang)} players finished their first ever set.`,
          es: `Se crearon ${n(report.newAccounts, lang)} cuentas y ${n(report.debuts, lang)} jugadores terminaron su primera partida.`,
        })}
      </p>
    </section>
  );
}

function PlayerTable({
  rows,
  lang,
  showDelta = false,
}: {
  rows: { id: string; username: string; sets: number; delta: number }[];
  lang: "en" | "es";
  showDelta?: boolean;
}) {
  return (
    <Card className="mt-3">
      <CardContent className="pt-4">
        <table className="w-full text-left text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="py-2 font-medium text-foreground">
                  <Link className="hover:underline" href={`/players/${row.id}`}>
                    {row.username}
                  </Link>
                </td>
                <td className="py-2 text-right tabular-nums">
                  {tr(lang, {
                    en: `${n(row.sets, lang)} ${row.sets === 1 ? "set" : "sets"}`,
                    es: `${n(row.sets, lang)} ${row.sets === 1 ? "partida" : "partidas"}`,
                  })}
                </td>
                {showDelta && (
                  <td className="py-2 pl-4 text-right font-medium tabular-nums text-foreground">
                    {row.delta > 0 ? "+" : ""}
                    {n(row.delta, lang)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Neighbours({ week, lang }: { week: string; lang: "en" | "es" }) {
  const ids = recentWeekIds(ARCHIVE_WEEKS);
  const index = ids.indexOf(week);
  const newer = index > 0 ? ids[index - 1] : null;
  const older = index >= 0 && index < ids.length - 1 ? ids[index + 1] : null;

  return (
    <nav className="mt-12 flex items-center justify-between border-t border-border pt-4 text-sm">
      <span>
        {older && (
          <Link className="text-muted-foreground hover:underline" href={`/reports/${older}`}>
            {tr(lang, { en: "← Previous week", es: "← Semana anterior" })}
          </Link>
        )}
      </span>
      <Link className="text-muted-foreground hover:underline" href="/reports">
        {tr(lang, { en: "All weeks", es: "Todas las semanas" })}
      </Link>
      <span>
        {newer && (
          <Link className="text-muted-foreground hover:underline" href={`/reports/${newer}`}>
            {tr(lang, { en: "Next week →", es: "Semana siguiente →" })}
          </Link>
        )}
      </span>
    </nav>
  );
}
