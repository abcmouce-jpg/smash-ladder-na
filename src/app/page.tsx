import Link from "next/link";
import { Swords, Trophy, Users } from "lucide-react";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { prisma } from "@/lib/db";

export default async function Home() {
  const session = await auth();
  const user = session?.user;

  const me = user?.id
    ? await prisma.user.findUnique({
        where: { id: user.id },
        select: { rating: true, gamesPlayed: true },
      })
    : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <Badge variant="outline" className="mb-4">
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
            await signIn("discord");
          }}
          className="mt-8"
        >
          <Button type="submit" size="lg">
            Sign in with Discord to get started
          </Button>
        </form>
      )}

      {user && me && (
        <p className="mt-6 text-sm text-muted-foreground tabular-nums">
          You&apos;re <span className="font-medium text-foreground">{me.rating}</span> rated
          across {me.gamesPlayed} games.
        </p>
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
