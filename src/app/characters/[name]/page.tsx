import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLang } from "@/lib/i18n";
import { tr } from "@/lib/lang";
import {
  characterFromSlug,
  characterPageTarget,
  characterSlug,
  characterLabel,
  echoGroupLabel,
  ECHO_FIGHTER_GROUPS,
} from "@/lib/characters";
import { getCharacterLeaderboard, getCharacterUsageStats } from "@/lib/character-stats";
import { getAllCharacterGuides, type GuideView } from "@/lib/character-guides";
import { HAS_COMMUNITY_GUIDES, SITE_NAME } from "@/lib/site";
import { CharacterIcon } from "@/components/character-icon";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// One page per fighter, holding what the site actually knows about it: the
// community's own write-ups plus this season's usage.
//
// The write-ups were already public, but only at /notes?tab=guides&character=…
// — a query string off a single sitemap entry, so thirty-four characters'
// worth of human writing amounted to one crawlable URL, and /characters was a
// redirect to the stats table. That is the shape AdSense kept refusing as
// insufficient content: a thousand templated profile pages and three pages of
// prose. This gives the prose somewhere to live.
//
// Deliberately read-only. Voting and posting live on /notes, which needs a
// signed-in viewer; a crawler and a first-time visitor get the text.

type Params = { name: string };

function resolve(slug: string) {
  const character = characterFromSlug(slug);
  // characterPageTarget holds the rules the sitemap also follows, so the URLs
  // advertised there and the URLs served here stay the same set: echoes fold
  // into their base, and "Random" is a queue option with no page.
  return character ? characterPageTarget(character) : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const character = resolve((await params).name);
  if (!character) return {};
  const lang = await getLang();
  const label = echoGroupLabel(character, lang);
  return {
    title: `${label} — ${SITE_NAME}`,
    description: tr(lang, {
      en: `${label} on ${SITE_NAME}: community write-ups, this season's win rate and games played, and the highest-rated players using the fighter.`,
      es: `${label} en ${SITE_NAME}: guías de la comunidad, la tasa de victorias y partidas de esta temporada, y los jugadores mejor clasificados que lo usan.`,
    }),
    alternates: { canonical: `/characters/${characterSlug(character)}` },
  };
}

export default async function CharacterPage({ params }: { params: Promise<Params> }) {
  const character = resolve((await params).name);
  if (!character) notFound();

  const lang = await getLang();
  const [usageByCharacter, players, guidesByCharacter] = await Promise.all([
    getCharacterUsageStats(),
    getCharacterLeaderboard(character),
    HAS_COMMUNITY_GUIDES ? getAllCharacterGuides(null) : Promise.resolve(new Map<string, GuideView[]>()),
  ]);

  const label = echoGroupLabel(character, lang);
  const usage = usageByCharacter.get(character);
  const guides = (guidesByCharacter.get(character) ?? []).slice().sort((a, b) => b.score - a.score);
  // The echo names this page also answers for, so a reader who came looking
  // for Daisy can see why they are on Peach's page.
  const echoes = (ECHO_FIGHTER_GROUPS.find((group) => group.includes(character)) ?? []).filter((c) => c !== character);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex items-center gap-3">
        <CharacterIcon name={character} size={48} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{label}</h1>
          {echoes.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {tr(lang, {
                en: `Counted together with ${echoes.map((c) => characterLabel(c, lang)).join(", ")}.`,
                es: `Contado junto con ${echoes.map((c) => characterLabel(c, lang)).join(", ")}.`,
              })}
            </p>
          )}
        </div>
      </div>

      {/* Prose first, and the numbers inside a sentence rather than only in a
          grid: a page that is nothing but figures reads as a data dump to a
          person and counts as thin to a crawler. */}
      <p className="mt-6 text-sm leading-relaxed">
        {usage && usage.games > 0
          ? tr(lang, {
              en: `${usage.players} ranked ${usage.players === 1 ? "player" : "players"} on ${SITE_NAME} play ${label}, ${usage.mains} of them as their main. They have played ${usage.games.toLocaleString("en-US")} ranked games with the fighter this season and won ${usage.winRate}% of them${usage.avgRating ? `, at an average rating of ${usage.avgRating}` : ""}.`,
              es: `${usage.players} ${usage.players === 1 ? "jugador clasificado" : "jugadores clasificados"} de ${SITE_NAME} usan ${label}, ${usage.mains} como personaje principal. Han jugado ${usage.games.toLocaleString("es-ES")} partidas clasificatorias con el personaje esta temporada y ganaron el ${usage.winRate}%${usage.avgRating ? `, con una clasificación media de ${usage.avgRating}` : ""}.`,
            })
          : tr(lang, {
              en: `No ranked games have been played on ${label} this season yet, so there is no win rate for the fighter to report.`,
              es: `Todavía no se han jugado partidas clasificatorias con ${label} esta temporada, así que no hay tasa de victorias que mostrar.`,
            })}
      </p>

      {HAS_COMMUNITY_GUIDES && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">
            {tr(lang, {
              en: `How players beat ${label}`,
              es: `Cómo los jugadores vencen a ${label}`,
            })}
          </h2>
          {guides.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {tr(lang, {
                en: `Nobody has written about ${label} yet.`,
                es: `Nadie ha escrito sobre ${label} todavía.`,
              })}{" "}
              <Link href="/notes?tab=guides" className="underline hover:no-underline">
                {tr(lang, { en: "Write the first one", es: "Escribe la primera" })}
              </Link>
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr(lang, {
                  en: `Written by players on the ladder, ordered by how the community voted them.`,
                  es: `Escrito por jugadores de la clasificación, ordenado según los votos de la comunidad.`,
                })}
              </p>
              <div className="mt-4 flex flex-col gap-3">
                {guides.map((guide) => (
                  <Card key={guide.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/players/${guide.authorId}`}
                          className="text-sm font-medium underline hover:no-underline"
                        >
                          {guide.author.username}
                        </Link>
                        <Badge variant="outline" className="tabular-nums">
                          {guide.score > 0 ? `+${guide.score}` : guide.score}
                        </Badge>
                      </div>
                      {/* whitespace-pre-line, not a markdown renderer: these are
                          plain-text notes and their line breaks are the only
                          structure they have. */}
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{guide.content}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                <Link
                  href={`/notes?tab=guides&character=${encodeURIComponent(character)}`}
                  className="underline hover:no-underline"
                >
                  {tr(lang, {
                    en: "Vote on these, or add your own",
                    es: "Vota estas, o añade la tuya",
                  })}
                </Link>
              </p>
            </>
          )}
        </section>
      )}

      {players.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">
            {tr(lang, {
              en: `Highest-rated ${label} players`,
              es: `Jugadores de ${label} mejor clasificados`,
            })}
          </h2>
          <div className="mt-3 flex flex-col divide-y divide-border">
            {players.slice(0, 10).map((player, i) => (
              <div key={player.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <Link href={`/players/${player.id}`} className="underline hover:no-underline">
                    {player.username}
                  </Link>
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {Math.round(player.rating)}{" "}
                  <span className="text-xs">
                    {tr(lang, {
                      en: `· ${player.gamesPlayed} sets`,
                      es: `· ${player.gamesPlayed} sets`,
                    })}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            <Link
              href={`/leaderboard?character=${encodeURIComponent(character)}`}
              className="underline hover:no-underline"
            >
              {tr(lang, {
                en: `See the full ${label} leaderboard`,
                es: `Ver la clasificación completa de ${label}`,
              })}
            </Link>
          </p>
        </section>
      )}

      <p className="mt-10 text-sm text-muted-foreground">
        <Link href="/stats?tab=characters" className="underline hover:no-underline">
          {tr(lang, {
            en: "Every fighter, side by side",
            es: "Todos los personajes, uno al lado del otro",
          })}
        </Link>
      </p>
    </main>
  );
}
