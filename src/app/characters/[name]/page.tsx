import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLang } from "@/lib/i18n";
import { tr } from "@/lib/lang";
import {
  characterFromSlug,
  characterSlug,
  characterLabel,
  echoGroupCanonical,
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
  // "Random" is a queue option, not a fighter — there is nothing to say about
  // it and a page for it would be an empty shell.
  if (!character || character === "Random") return null;
  // Echoes fold into their base everywhere else (the leaderboard, the stats
  // table, the guide grouping), so they do here too rather than serving a
  // near-duplicate page per echo.
  return echoGroupCanonical(character);
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
      ja: `${SITE_NAME}の${label}：コミュニティの対策メモ、今シーズンの勝率と試合数、このキャラを使う上位プレイヤー。`,
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
                ja: `${echoes.map((c) => characterLabel(c, lang)).join("・")}と合算しています。`,
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
              ja: `${SITE_NAME}でランク対象のプレイヤー${usage.players}人が${label}を使っていて、うち${usage.mains}人がメインにしています。今シーズンはこのキャラで${usage.games.toLocaleString("ja-JP")}試合を戦い、勝率は${usage.winRate}%です${usage.avgRating ? `（平均レート${usage.avgRating}）` : ""}。`,
            })
          : tr(lang, {
              en: `No ranked games have been played on ${label} this season yet, so there is no win rate for the fighter to report.`,
              es: `Todavía no se han jugado partidas clasificatorias con ${label} esta temporada, así que no hay tasa de victorias que mostrar.`,
              ja: `今シーズンはまだ${label}でのランク対戦がないため、勝率は出ていません。`,
            })}
      </p>

      {HAS_COMMUNITY_GUIDES && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">
            {tr(lang, {
              en: `How players beat ${label}`,
              es: `Cómo los jugadores vencen a ${label}`,
              ja: `${label}対策`,
            })}
          </h2>
          {guides.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {tr(lang, {
                en: `Nobody has written about ${label} yet.`,
                es: `Nadie ha escrito sobre ${label} todavía.`,
                ja: `${label}についてはまだ誰も書いていません。`,
              })}{" "}
              <Link href="/notes?tab=guides" className="underline hover:no-underline">
                {tr(lang, { en: "Write the first one", es: "Escribe la primera", ja: "最初に書く" })}
              </Link>
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr(lang, {
                  en: `Written by players on the ladder, ordered by how the community voted them.`,
                  es: `Escrito por jugadores de la clasificación, ordenado según los votos de la comunidad.`,
                  ja: `ラダーのプレイヤーが書いたもので、投票順に並んでいます。`,
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
                    ja: "投票する・自分のを書く",
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
              ja: `${label}使いの上位プレイヤー`,
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
                      ja: `· ${player.gamesPlayed}セット`,
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
                ja: `${label}のランキング全体を見る`,
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
            ja: "全キャラの一覧を見る",
          })}
        </Link>
      </p>
    </main>
  );
}
