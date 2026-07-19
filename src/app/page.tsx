import Link from "next/link";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
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
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Smash Ladder NA</h1>
      <p className="mt-2 text-sm text-zinc-500">
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
          <Button type="submit">Sign in with Discord to get started</Button>
        </form>
      )}

      {user && me && (
        <p className="mt-6 text-sm text-zinc-500 tabular-nums">
          You&apos;re {me.rating} rated across {me.gamesPlayed} games.
        </p>
      )}

      <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href="/lobby"
          className="rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
        >
          <p className="text-sm font-medium">Ranked Lobby</p>
          <p className="mt-1 text-sm text-zinc-500">
            Queue up and get auto-paired for a rated match.
          </p>
        </Link>
        <Link
          href="/free-battle"
          className="rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
        >
          <p className="text-sm font-medium">Free Battle</p>
          <p className="mt-1 text-sm text-zinc-500">
            Post up for casual, unranked friendlies.
          </p>
        </Link>
        <Link
          href="/leaderboard"
          className="rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
        >
          <p className="text-sm font-medium">Leaderboard</p>
          <p className="mt-1 text-sm text-zinc-500">See where you stack up.</p>
        </Link>
      </div>
    </main>
  );
}
