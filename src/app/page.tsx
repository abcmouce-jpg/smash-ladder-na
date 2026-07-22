import Image from "next/image";
import Link from "next/link";
import { Activity, Swords, Trophy, Users } from "lucide-react";
import { auth, signIn } from "@/auth";
import { getPublicStats } from "@/lib/public-stats";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RankBadge } from "@/components/rank-badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { prisma } from "@/lib/db";

export default async function Home() {
  const session = await auth();
  const user = session?.user;

  const [me, stats] = await Promise.all([
    user?.id
      ? prisma.user.findUnique({
          where: { id: user.id },
          select: { rating: true, gamesPlayed: true },
        })
      : null,
    getPublicStats(),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
        North America
      </Badge>
      <h1 className="text-4xl font-semibold tracking-tight text-balance">Smash Ladder NA</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        A ranked ladder and matchmaking hub for the North American Smash community.
      </p>

      {!user && (
        <form
          action={async () => {
            "use server";
            await signIn();
          }}
          className="mt-8"
        >
          <Button type="submit" size="lg">
            Sign in to get started
          </Button>
        </form>
      )}

      {user && me && (
        <p className="mt-6 text-sm text-muted-foreground tabular-nums">
          You&apos;re <span className="font-medium text-foreground">{me.rating}</span> rated
          across {me.gamesPlayed} games.
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {stats.playingNow > 0 && (
          <span className="flex items-center gap-1.5 tabular-nums">
            <span className="relative flex size-2">
              <span className="live-pulse absolute inline-flex size-full rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-medium text-foreground">{stats.playingNow}</span> playing now
          </span>
        )}
        <span className="flex items-center gap-1.5 tabular-nums">
          <Users className="size-3.5 text-primary" />
          <span className="font-medium text-foreground">{stats.totalPlayers}</span> players
        </span>
        <span className="flex items-center gap-1.5 tabular-nums">
          <Activity className="size-3.5 text-primary" />
          <span className="font-medium text-foreground">{stats.matchesToday}</span> matches today
        </span>
      </div>

      {stats.topPlayers.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Top of the ladder
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {stats.topPlayers.map((p, i) => (
              <Link key={p.id} href={`/players/${p.id}`}>
                <Card className="h-full py-0 transition-colors hover:border-foreground/30">
                  <CardContent className="flex items-center gap-3 py-3">
                    <span className="shrink-0 text-lg tabular-nums text-muted-foreground">
                      {["🥇", "🥈", "🥉"][i]}
                    </span>
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
                        <p className="text-xs tabular-nums text-muted-foreground">{p.rating} rating</p>
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

      <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/lobby">
          <Card className="h-full transition-colors hover:border-foreground/30">
            <CardHeader>
              <Swords className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">Ranked Lobby</CardTitle>
              <CardDescription>Queue up and get auto-paired for a rated match.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/free-battle">
          <Card className="h-full transition-colors hover:border-foreground/30">
            <CardHeader>
              <Users className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">Free Battle</CardTitle>
              <CardDescription>Post up for casual, unranked friendlies.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/leaderboard">
          <Card className="h-full transition-colors hover:border-foreground/30">
            <CardHeader>
              <Trophy className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">Leaderboard</CardTitle>
              <CardDescription>See where you stack up.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </main>
  );
}
