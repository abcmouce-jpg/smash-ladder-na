import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Activity, MapPin, Users } from "lucide-react";
import { auth, signIn, primaryProviderId } from "@/auth";
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
  title: "Smash Ladder NA — Liga clasificatoria",
  description: "Liga clasificatoria y emparejamiento de Norteamérica para Smash, en español.",
  alternates: { languages: { "en-US": "/" } },
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

// Kept as its own crawlable route for SEO — a first-touch landing page for
// Spanish-language search/social traffic — even though "/" now renders the
// same content in-place via getLang(). proxy.ts sets the "lang" cookie on
// any visit here, so navigating onward (via the header nav, hero CTAs, etc.)
// stays in Spanish instead of snapping back to English on the next page.
export default async function HomeEs() {
  const session = await auth();
  const user = session?.user;

  const [me, stats, feed, posts, matchTimestamps] = await Promise.all([
    user?.id
      ? prisma.user.findUnique({
          where: { id: user.id },
          select: { rating: true, gamesPlayed: true },
        })
      : null,
    getPublicStats(),
    getMatchFeed(),
    getBoardPosts(6),
    getMatchesPerDay(30),
  ]);
  const parentHost = (await headers()).get("host") ?? "smash-ladder-na.vercel.app";
  const liveEntries = feed.filter((entry) => entry.hasLiveStreamer).map(serializeSetEntry);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-primary/30 text-primary">
          Norteamérica
        </Badge>
      </div>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance">
        Smash Ladder <span className="text-primary">NA</span>
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        Una liga clasificatoria y emparejamiento para la comunidad de Smash de Norteamérica.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {user ? (
          <>
            <Button asChild size="lg">
              <Link href="/lobby">Ir a la Sala</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={DISCORD_SERVER_URL} target="_blank" rel="noreferrer">
                <DiscordIcon className="size-4" />
                Únete a nuestro servidor de Discord
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
                Inicia sesión con Discord
              </Button>
            </form>
            <Button asChild variant="outline" size="lg">
              <a href={DISCORD_SERVER_URL} target="_blank" rel="noreferrer">
                <DiscordIcon className="size-4" />
                Únete a nuestro servidor de Discord
              </a>
            </Button>
          </>
        )}
      </div>

      {user && me && (
        <p className="mt-6 text-sm text-muted-foreground tabular-nums">
          Tienes una clasificación de <span className="font-medium text-foreground">{me.rating}</span> en{" "}
          {me.gamesPlayed} partidas.
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {stats.playingNow > 0 && (
          <span className="flex items-center gap-1.5 tabular-nums">
            <span className="relative flex size-2">
              <span className="live-pulse absolute inline-flex size-full rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-medium text-foreground">{stats.playingNow}</span> jugando ahora
          </span>
        )}
        <span className="flex items-center gap-1.5 tabular-nums">
          <Users className="size-3.5 text-primary" />
          <span className="font-medium text-foreground">{stats.totalPlayers}</span> jugadores
        </span>
        <span className="flex items-center gap-1.5 tabular-nums">
          <Activity className="size-3.5 text-primary" />
          <span className="font-medium text-foreground">{stats.matchesToday}</span> partidas hoy
        </span>
      </div>

      {liveEntries.length > 0 && (
        <div className="mt-10">
          <SectionHeading label="En vivo en Twitch" />
          <LiveStreamProvider>
            <div className="mt-3">
              <LiveStreamStage entries={liveEntries} parentHost={parentHost} />
              <LiveStreamThumbnails entries={liveEntries} lang="es" />
            </div>
          </LiveStreamProvider>
        </div>
      )}

      {stats.topPlayers.length > 0 && (
        <div className="mt-10">
          <SectionHeading
            label="Los mejores de la liga"
            action={
              <Link
                href="/leaderboard"
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Ver todos →
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
                        <p className="text-xs tabular-nums text-muted-foreground">{p.rating} de clasificación</p>
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
        <SectionHeading label="Publicaciones del Tablón" />
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
                Nadie está buscando partida ahora mismo — sé el primero en publicar.
              </p>
              <Button asChild variant="secondary" size="sm" className="mt-3">
                <Link href="/board">Abrir el Tablón</Link>
              </Button>
            </CardContent>
          </Card>
        )}
        {user ? (
          <Link
            href="/board"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Publica en el Tablón →
          </Link>
        ) : (
          <a
            href={DISCORD_SERVER_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Únete a nuestro Discord para encontrar partidas
          </a>
        )}
      </div>

      <div className="mt-10">
        <SectionHeading label="Partidas por día" />
        <Card className="mt-3">
          <CardContent className="pt-4">
            <MatchesPerDayChart timestamps={matchTimestamps} lang="es" />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
