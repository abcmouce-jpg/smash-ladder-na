import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Activity, Users } from "lucide-react";
import { auth, signIn, primaryProviderId } from "@/auth";
import { getLang } from "@/lib/i18n";
import { formatRating } from "@/lib/rating-format";
import { isRatingVisible, PROVISIONAL_GAMES_THRESHOLD } from "@/lib/rank-tier";
import { getMatchesPerDay, getPublicStats } from "@/lib/public-stats";
import { getFriendliesPosts } from "@/lib/home-feed";
import { getMatchFeed } from "@/lib/match-feed";
import { serializeSetEntry } from "@/lib/set-entry";
import { Button } from "@/components/ui/button";
import { DiscordIcon } from "@/components/discord-icon";
import { RankBadge } from "@/components/rank-badge";
import { FriendliesPosts } from "@/components/friendlies-posts";
import { MatchesPerDayChart } from "@/components/matches-per-day-chart";
import { Card, CardContent } from "@/components/ui/card";
import { LiveStreamProvider } from "@/components/live-streams/selection";
import { LiveStreamStage } from "@/components/live-streams/stage";
import { LiveStreamThumbnails } from "@/components/live-streams/thumbnails";
import { prisma } from "@/lib/db";
import { X_ACCOUNT_URL, DISCORD_SERVER_URL } from "@/lib/links";
import { tr, trNode } from "@/lib/lang";
import { PUBLISHES_SPANISH, HAS_DISCORD_SERVER, SCENE_LABEL, SITE_NAME_PARTS } from "@/lib/site";

export const metadata: Metadata = {
  alternates: PUBLISHES_SPANISH ? { languages: { "es-MX": "/es" } } : undefined,
};

// Shared home section header: small-caps label with the accent tick on the
// left, optional action link on the right.
function SectionHeading({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        <span aria-hidden className="h-3.5 w-1 rounded-full bg-primary" />
        {label}
      </h2>
      {action}
    </div>
  );
}

export default async function Home() {
  const session = await auth();
  const user = session?.user;

  const [me, stats, lang, feed, posts, matchTimestamps] = await Promise.all([
    user?.id
      ? prisma.user.findUnique({
          where: { id: user.id },
          select: { rating: true, gamesPlayed: true },
        })
      : null,
    getPublicStats(),
    getLang(),
    getMatchFeed(),
    getFriendliesPosts(6),
    getMatchesPerDay(30),
  ]);
  const parentHost = (await headers()).get("host") ?? "smash-ladder-na.vercel.app";
  const liveEntries = feed.filter((entry) => entry.hasLiveStreamer).map(serializeSetEntry);
  const ratingVisible = Boolean(
    me && user && isRatingVisible(me.gamesPlayed, user.role === "MOD" || user.role === "ADMIN"),
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance">
        {SITE_NAME_PARTS.lead && `${SITE_NAME_PARTS.lead} `}
        <span className="text-primary">{SITE_NAME_PARTS.accent}</span>
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        {tr(lang, {
          en: `A ranked ladder and matchmaking hub for the ${SCENE_LABEL.en} Smash community.`,
          es: `Una liga clasificatoria y emparejamiento para la comunidad de Smash ${SCENE_LABEL.es}.`,
          ja: `${SCENE_LABEL.ja}スマブラコミュニティ向けの、レート対戦とマッチングのサイト。`,
        })}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {user ? (
          <>
            <Button asChild size="lg">
              <Link href="/lobby">
                {tr(lang, {
                  en: "Go to Lobby",
                  es: "Ir a la Sala",
                  ja: "ロビーへ",
                })}
              </Link>
            </Button>
            {HAS_DISCORD_SERVER && (
              <Button asChild variant="outline" size="lg">
                <a href={DISCORD_SERVER_URL} target="_blank" rel="noreferrer">
                  <DiscordIcon className="size-4" />
                  {tr(lang, {
                    en: "Join Our Discord Server",
                    es: "Únete a nuestro servidor de Discord",
                    ja: "Discord サーバーに参加",
                  })}
                </a>
              </Button>
            )}
          </>
        ) : (
          <>
            <form
              action={async () => {
                "use server";
                await signIn(primaryProviderId);
              }}
            >
              <Button type="submit" size="lg">
                <DiscordIcon className="size-4" />
                {tr(lang, {
                  en: "Log in with Discord",
                  es: "Inicia sesión con Discord",
                  ja: "Discord でログイン",
                })}
              </Button>
            </form>
            {HAS_DISCORD_SERVER && (
              <Button asChild variant="outline" size="lg">
                <a href={DISCORD_SERVER_URL} target="_blank" rel="noreferrer">
                  <DiscordIcon className="size-4" />
                  {tr(lang, {
                    en: "Join Our Discord Server",
                    es: "Únete a nuestro servidor de Discord",
                    ja: "Discord サーバーに参加",
                  })}
                </a>
              </Button>
            )}
          </>
        )}
      </div>

      {user && me && (
        <p className="mt-6 text-sm text-muted-foreground tabular-nums">
          {!ratingVisible
            ? trNode(lang, {
                en: (
                  <>
                    Your rating appears after {PROVISIONAL_GAMES_THRESHOLD} sets —{" "}
                    <span className="font-medium text-foreground">
                      {me.gamesPlayed}/{PROVISIONAL_GAMES_THRESHOLD}
                    </span>{" "}
                    so far.
                  </>
                ),
                es: (
                  <>
                    Tu clasificación aparece a las {PROVISIONAL_GAMES_THRESHOLD} partidas —{" "}
                    <span className="font-medium text-foreground">
                      {me.gamesPlayed}/{PROVISIONAL_GAMES_THRESHOLD}
                    </span>{" "}
                    hasta ahora.
                  </>
                ),
                ja: (
                  <>
                    レートは{PROVISIONAL_GAMES_THRESHOLD}セットから表示されます（いま
                    <span className="font-medium text-foreground">
                      {me.gamesPlayed}/{PROVISIONAL_GAMES_THRESHOLD}
                    </span>
                    ）。
                  </>
                ),
              })
            : trNode(lang, {
                en: (
                  <>
                    You&apos;re <span className="font-medium text-foreground">{formatRating(me.rating)}</span> rated
                    across {me.gamesPlayed} sets.
                  </>
                ),
                es: (
                  <>
                    Tienes una clasificación de{" "}
                    <span className="font-medium text-foreground">{formatRating(me.rating)}</span> en {me.gamesPlayed}{" "}
                    partidas.
                  </>
                ),
                ja: (
                  <>
                    {me.gamesPlayed}セットを戦って、レートは{" "}
                    <span className="font-medium text-foreground">{formatRating(me.rating)}</span> です。
                  </>
                ),
              })}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {stats.playingNow > 0 && (
          <span className="flex items-center gap-1.5 tabular-nums">
            <span className="relative flex size-2">
              <span className="live-pulse absolute inline-flex size-full rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span>
              {trNode(lang, {
                en: (
                  <>
                    <span className="font-medium text-foreground">{stats.playingNow}</span> playing now
                  </>
                ),
                es: (
                  <>
                    <span className="font-medium text-foreground">{stats.playingNow}</span> jugando ahora
                  </>
                ),
                ja: (
                  <>
                    <span className="font-medium text-foreground">{stats.playingNow}</span>人が対戦中
                  </>
                ),
              })}
            </span>
          </span>
        )}
        <span className="flex items-center gap-1.5 tabular-nums">
          <Users className="size-3.5 text-primary" />
          <span>
            {trNode(lang, {
              en: (
                <>
                  <span className="font-medium text-foreground">{stats.totalPlayers}</span> players
                </>
              ),
              es: (
                <>
                  <span className="font-medium text-foreground">{stats.totalPlayers}</span> jugadores
                </>
              ),
              ja: (
                <>
                  プレイヤー<span className="font-medium text-foreground">{stats.totalPlayers}</span>人
                </>
              ),
            })}
          </span>
        </span>
        <span className="flex items-center gap-1.5 tabular-nums">
          <Activity className="size-3.5 text-primary" />
          <span>
            {trNode(lang, {
              en: (
                <>
                  <span className="font-medium text-foreground">{stats.matchesToday}</span> matches today
                </>
              ),
              es: (
                <>
                  <span className="font-medium text-foreground">{stats.matchesToday}</span> partidas hoy
                </>
              ),
              ja: (
                <>
                  今日の試合<span className="font-medium text-foreground">{stats.matchesToday}</span>件
                </>
              ),
            })}
          </span>
        </span>
      </div>

      {liveEntries.length > 0 && (
        <div className="mt-10">
          <SectionHeading
            label={tr(lang, {
              en: "Live on Twitch",
              es: "En vivo en Twitch",
              ja: "Twitch で配信中",
            })}
          />
          <LiveStreamProvider>
            <div className="mt-3">
              <LiveStreamStage entries={liveEntries} parentHost={parentHost} />
              <LiveStreamThumbnails entries={liveEntries} lang={lang} />
            </div>
          </LiveStreamProvider>
        </div>
      )}

      {stats.topPlayers.length > 0 && (
        <div className="mt-10">
          <SectionHeading
            label={tr(lang, {
              en: "Top of the ladder",
              es: "Los mejores de la liga",
              ja: "ランキング上位",
            })}
            action={
              <Link
                href="/leaderboard"
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {tr(lang, {
                  en: "See all →",
                  es: "Ver todos →",
                  ja: "すべて見る →",
                })}
              </Link>
            }
          />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {stats.topPlayers.map((p, i) => (
              <Link key={p.id} href={`/players/${p.id}`}>
                <Card className="h-full py-0 transition-colors hover:border-foreground/30">
                  <CardContent className="flex items-center gap-3 py-3">
                    <span className="shrink-0 text-lg tabular-nums text-muted-foreground">{["🥇", "🥈", "🥉"][i]}</span>
                    {p.avatarUrl && (
                      <Image
                        src={p.avatarUrl}
                        alt={p.username}
                        width={32}
                        height={32}
                        className="shrink-0 rounded-full"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.username}</p>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {formatRating(p.rating)}{" "}
                          {tr(lang, {
                            en: "rating",
                            es: "de clasificación",
                            ja: "レート",
                          })}
                        </p>
                        <RankBadge rating={p.rating} gamesPlayed={p.gamesPlayed} lang={lang} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10">
        <SectionHeading
          label={tr(lang, {
            en: "Friendlies",
            es: "Amistosos",
            ja: "フリー対戦",
          })}
        />
        <FriendliesPosts
          posts={posts}
          lang={lang}
          emptyAction={
            <Button asChild variant="secondary" size="sm" className="mt-3">
              <Link href="/friendlies">
                {tr(lang, {
                  en: "Open Friendlies",
                  es: "Abrir Amistosos",
                  ja: "募集中のフリー対戦",
                })}
              </Link>
            </Button>
          }
        />
        {user ? (
          <Link
            href="/friendlies"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {tr(lang, {
              en: "Post on Friendlies →",
              es: "Publica en Amistosos →",
              ja: "フリー対戦に投稿する →",
            })}
          </Link>
        ) : (
          <a
            href={HAS_DISCORD_SERVER ? DISCORD_SERVER_URL : X_ACCOUNT_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {HAS_DISCORD_SERVER
              ? tr(lang, {
                  en: "Join our Discord to find games",
                  es: "Únete a nuestro Discord para encontrar partidas",
                  ja: "Discord に参加して対戦相手を見つける",
                })
              : tr(lang, {
                  en: "Follow us on X for match-finding posts",
                  es: "Síguenos en X para encontrar partidas",
                  ja: "X をフォローして対戦相手を見つける",
                })}
          </a>
        )}
      </div>

      <div className="mt-10">
        <SectionHeading
          label={tr(lang, {
            en: "Matches per day",
            es: "Partidas por día",
            ja: "1日あたりの試合数",
          })}
        />
        <Card className="mt-3">
          <CardContent className="pt-4">
            <MatchesPerDayChart timestamps={matchTimestamps} lang={lang} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
