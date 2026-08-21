import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Activity, Coffee, Handshake, Swords, Trophy, Users } from "lucide-react";
import { auth, signIn, primaryProviderId } from "@/auth";
import { getMatchesPerDay, getPublicStats, getTopGrinders } from "@/lib/public-stats";
import { Button } from "@/components/ui/button";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { DiscordIcon } from "@/components/discord-icon";
import { RankBadge } from "@/components/rank-badge";
import { MatchesPerDayChart } from "@/components/matches-per-day-chart";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { DISCORD_SERVER_URL } from "@/lib/links";
import { getLang } from "@/lib/i18n";
import { getTopRecruiters } from "@/lib/referrals";

export const metadata: Metadata = {
  alternates: { languages: { "es-MX": "/es" } },
};

export default async function Home() {
  const session = await auth();
  const user = session?.user;

  const [me, stats, lang, topRecruiters, topGrinders, matchTimestamps] = await Promise.all([
    user?.id
      ? prisma.user.findUnique({
          where: { id: user.id },
          select: { rating: true, gamesPlayed: true },
        })
      : null,
    getPublicStats(),
    getLang(),
    getTopRecruiters(3),
    getTopGrinders(3),
    getMatchesPerDay(30),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-20">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-primary/30 text-primary">
          {lang === "es" ? "Norteamérica" : "North America"}
        </Badge>
        <a
          href={DISCORD_SERVER_URL}
          target="_blank"
          rel="noreferrer"
          className={cn(
            badgeVariants({ variant: "outline" }),
            "border-transparent bg-[#5865F2] text-white transition-colors hover:bg-[#4752C4]",
          )}
        >
          <DiscordIcon className="size-3.5" />
          Discord
        </a>
      </div>
      <h1 className="text-4xl font-semibold tracking-tight text-balance">Smash Ladder NA</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        {lang === "es"
          ? "Una liga clasificatoria y emparejamiento para la comunidad de Smash de Norteamérica."
          : "A ranked ladder and matchmaking hub for the North American Smash community."}
      </p>

      {!user && (
        <form
          action={async () => {
            "use server";
            await signIn(primaryProviderId);
          }}
          className="mt-8"
        >
          <Button type="submit" size="lg">
            {lang === "es" ? "Inicia sesión para empezar" : "Sign in to get started"}
          </Button>
        </form>
      )}

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

      {stats.topPlayers.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {lang === "es" ? "Los mejores de la liga" : "Top of the ladder"}
          </h2>
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
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {lang === "es" ? "Partidas por día" : "Matches per day"}
        </h2>
        <Card className="mt-3">
          <CardContent className="pt-4">
            <MatchesPerDayChart timestamps={matchTimestamps} lang={lang} />
          </CardContent>
        </Card>
      </div>

      {topGrinders.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {lang === "es" ? "Los que más juegan" : "Top grinders"}
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {topGrinders.map((g) => (
              <Link key={g.id} href={`/players/${g.id}`}>
                <Card className="h-full py-0 transition-colors hover:border-foreground/30">
                  <CardContent className="flex items-center gap-3 py-3">
                    {g.avatarUrl && (
                      <Image
                        src={g.avatarUrl}
                        alt={g.username}
                        width={32}
                        height={32}
                        className="shrink-0 rounded-full"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{g.username}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {lang === "es"
                          ? `${g.gamesPlayed} ${g.gamesPlayed === 1 ? "partida jugada" : "partidas jugadas"}`
                          : `${g.gamesPlayed} ${g.gamesPlayed === 1 ? "set" : "sets"} played`}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {topRecruiters.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {lang === "es" ? "Los que más invitan" : "Top recruiters"}
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {topRecruiters.map((r) => (
              <Link key={r.id} href={`/players/${r.id}`}>
                <Card className="h-full py-0 transition-colors hover:border-foreground/30">
                  <CardContent className="flex items-center gap-3 py-3">
                    {r.avatarUrl && (
                      <Image
                        src={r.avatarUrl}
                        alt={r.username}
                        width={32}
                        height={32}
                        className="shrink-0 rounded-full"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.username}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {lang === "es"
                          ? `${r.count} ${r.count === 1 ? "jugador invitado" : "jugadores invitados"}`
                          : `${r.count} ${r.count === 1 ? "player" : "players"} invited`}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href="/lobby">
          <Card className="h-full transition-colors hover:border-foreground/30">
            <CardHeader>
              <Swords className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">{lang === "es" ? "Sala clasificatoria" : "Ranked Lobby"}</CardTitle>
              <CardDescription>
                {lang === "es"
                  ? "Ponte en cola y te emparejamos automáticamente para una partida clasificatoria."
                  : "Queue up and get auto-paired for a rated match."}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/free-battle">
          <Card className="h-full transition-colors hover:border-foreground/30">
            <CardHeader>
              <Handshake className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">{lang === "es" ? "Free Battle" : "Free Battle"}</CardTitle>
              <CardDescription>
                {lang === "es"
                  ? "Amistosos casuales sin afectar tu clasificación — ni región, ni cola automática, tú eliges con quién jugar."
                  : "Casual, unranked friendlies — no region needed, no auto-matching, you pick who to play."}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/leaderboard">
          <Card className="h-full transition-colors hover:border-foreground/30">
            <CardHeader>
              <Trophy className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">{lang === "es" ? "Tabla de clasificación" : "Leaderboard"}</CardTitle>
              <CardDescription>
                {lang === "es" ? "Mira en qué posición estás." : "See where you stack up."}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <a href={DISCORD_SERVER_URL} target="_blank" rel="noreferrer" className="h-full">
          <Card className="h-full transition-colors hover:border-foreground/30">
            <CardHeader>
              <DiscordIcon className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">Discord</CardTitle>
              <CardDescription>
                {lang === "es"
                  ? "Únete al servidor de la comunidad para socializar y obtener ayuda."
                  : "Join the community server to hang out and get support."}
              </CardDescription>
            </CardHeader>
          </Card>
        </a>
        <Link href="/supporters" className="h-full">
          <Card className="h-full transition-colors hover:border-foreground/30">
            <CardHeader>
              <Coffee className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">{lang === "es" ? "Colaboradores" : "Supporters"}</CardTitle>
              <CardDescription>
                {lang === "es"
                  ? "Ayuda a cubrir el hosting — totalmente opcional."
                  : "Help cover hosting costs — entirely optional."}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </main>
  );
}
