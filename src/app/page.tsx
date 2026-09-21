import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Activity, MapPin, Users } from "lucide-react";
import { auth, signIn, primaryProviderId } from "@/auth";
import { getLang } from "@/lib/i18n";
import { getMatchesPerDay, getPublicStats } from "@/lib/public-stats";
import { getBoardPosts } from "@/lib/home-feed";
import { getMatchFeed } from "@/lib/match-feed";
import { serializeSetEntry } from "@/lib/set-entry";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DiscordIcon } from "@/components/discord-icon";
import { RankBadge } from "@/components/rank-badge";
import { LocalTime } from "@/components/local-time";
import { MatchesPerDayChart } from "@/components/matches-per-day-chart";
import { Card, CardContent } from "@/components/ui/card";
import { LiveStreamProvider } from "@/components/live-streams/selection";
import { LiveStreamStage } from "@/components/live-streams/stage";
import { LiveStreamThumbnails } from "@/components/live-streams/thumbnails";
import { prisma } from "@/lib/db";
import { DISCORD_SERVER_URL } from "@/lib/links";

export const metadata: Metadata = {
  alternates: { languages: { "es-MX": "/es" } },
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
    getBoardPosts(6),
    getMatchesPerDay(30),
  ]);
  const parentHost = (await headers()).get("host") ?? "smash-ladder-na.vercel.app";
  const liveEntries = feed.filter((entry) => entry.hasLiveStreamer).map(serializeSetEntry);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance">
        Smash Ladder <span className="text-primary">NA</span>
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        {lang === "es"
          ? "Una liga clasificatoria y emparejamiento para la comunidad de Smash de Norteamérica."
          : "A ranked ladder and matchmaking hub for the North American Smash community."}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {user ? (
          <>
            <Button asChild size="lg">
              <Link href="/lobby">{lang === "es" ? "Ir a la Sala" : "Go to Lobby"}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={DISCORD_SERVER_URL} target="_blank" rel="noreferrer">
                <DiscordIcon className="size-4" />
                {lang === "es" ? "Únete a nuestro servidor de Discord" : "Join Our Discord Server"}
              </a>
            </Button>
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
                {lang === "es" ? "Inicia sesión con Discord" : "Log in with Discord"}
              </Button>
            </form>
            <Button asChild variant="outline" size="lg">
              <a href={DISCORD_SERVER_URL} target="_blank" rel="noreferrer">
                <DiscordIcon className="size-4" />
                {lang === "es" ? "Únete a nuestro servidor de Discord" : "Join Our Discord Server"}
              </a>
            </Button>
          </>
        )}
      </div>

      {user && me && (
        <p className="mt-6 text-sm text-muted-foreground tabular-nums">
          {lang === "es" ? (
            <>
              Tienes una clasificación de <span className="font-medium text-foreground">{me.rating}</span> en{" "}
              {me.gamesPlayed} partidas.
            </>
          ) : (
            <>
              You&apos;re <span className="font-medium text-foreground">{me.rating}</span> rated across {me.gamesPlayed}{" "}
              sets.
            </>
          )}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {stats.playingNow > 0 && (
          <span className="flex items-center gap-1.5 tabular-nums">
            <span className="relative flex size-2">
              <span className="live-pulse absolute inline-flex size-full rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-medium text-foreground">{stats.playingNow}</span>{" "}
            {lang === "es" ? "jugando ahora" : "playing now"}
          </span>
        )}
        <span className="flex items-center gap-1.5 tabular-nums">
          <Users className="size-3.5 text-primary" />
          <span className="font-medium text-foreground">{stats.totalPlayers}</span>{" "}
          {lang === "es" ? "jugadores" : "players"}
        </span>
        <span className="flex items-center gap-1.5 tabular-nums">
          <Activity className="size-3.5 text-primary" />
          <span className="font-medium text-foreground">{stats.matchesToday}</span>{" "}
          {lang === "es" ? "partidas hoy" : "matches today"}
        </span>
      </div>

      {liveEntries.length > 0 && (
        <div className="mt-10">
          <SectionHeading label={lang === "es" ? "En vivo en Twitch" : "Live on Twitch"} />
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
            label={lang === "es" ? "Los mejores de la liga" : "Top of the ladder"}
            action={
              <Link
                href="/leaderboard"
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {lang === "es" ? "Ver todos →" : "See all →"}
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
                          {p.rating} {lang === "es" ? "de clasificación" : "rating"}
                        </p>
                        <RankBadge rating={p.rating} gamesPlayed={p.gamesPlayed} />
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
        <SectionHeading label={lang === "es" ? "Publicaciones del Tablón" : "Board posts"} />
        {posts.length > 0 ? (
          <Card className="mt-3 divide-y divide-border overflow-hidden py-0">
            {posts.map((post) => (
              <div key={post.id} className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  {post.author.avatarUrl && (
                    <Image
                      src={post.author.avatarUrl}
                      alt={post.author.username}
                      width={20}
                      height={20}
                      className="shrink-0 rounded-full"
                    />
                  )}
                  <Link
                    href={`/players/${post.author.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                  >
                    {post.author.username}
                  </Link>
                  <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                    <span>{post.author.rating}</span>
                    <span aria-hidden>·</span>
                    <LocalTime iso={post.createdAt.toISOString()} />
                  </span>
                </div>
                <p className="mt-1 text-sm leading-snug">{post.comment}</p>
                {(post.region || post.minTier) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {post.region && (
                      <Badge variant="outline">
                        <MapPin className="size-3" />
                        {post.region}
                      </Badge>
                    )}
                    {post.minTier && <Badge variant="outline">{post.minTier}+</Badge>}
                  </div>
                )}
              </div>
            ))}
          </Card>
        ) : (
          <Card className="mt-3">
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">
                {lang === "es"
                  ? "Nadie está buscando partida ahora mismo — sé el primero en publicar."
                  : "No one's looking for a game right now — be the first to post."}
              </p>
              <Button asChild variant="secondary" size="sm" className="mt-3">
                <Link href="/board">{lang === "es" ? "Abrir el Tablón" : "Open the Board"}</Link>
              </Button>
            </CardContent>
          </Card>
        )}
        {user ? (
          <Link
            href="/board"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {lang === "es" ? "Publica en el Tablón →" : "Post on the Board →"}
          </Link>
        ) : (
          <a
            href={DISCORD_SERVER_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {lang === "es" ? "Únete a nuestro Discord para encontrar partidas" : "Join our Discord to find games"}
          </a>
        )}
      </div>

      <div className="mt-10">
        <SectionHeading label={lang === "es" ? "Partidas por día" : "Matches per day"} />
        <Card className="mt-3">
          <CardContent className="pt-4">
            <MatchesPerDayChart timestamps={matchTimestamps} lang={lang} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
