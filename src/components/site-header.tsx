import Image from "next/image";
import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold tracking-tight">Smash Ladder NA</span>
          {user && (
            <nav className="flex items-center gap-4 text-sm text-zinc-500">
              <Link href="/lobby" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                Lobby
              </Link>
              <Link href="/free-battle" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                Free Battle
              </Link>
              <Link href="/leaderboard" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                Leaderboard
              </Link>
              {(user.role === "MOD" || user.role === "ADMIN") && (
                <Link
                  href="/admin/disputes"
                  className="hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Disputes
                </Link>
              )}
            </nav>
          )}
        </div>

        {user ? (
          <div className="flex items-center gap-3">
            <Link href={`/players/${user.id}`} className="flex items-center gap-2">
              {user.image && (
                <Image
                  src={user.image}
                  alt={user.name ?? "avatar"}
                  width={24}
                  height={24}
                  className="rounded-full"
                />
              )}
              <span className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
                {user.name}
              </span>
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("discord");
            }}
          >
            <Button type="submit" size="sm">
              Sign in with Discord
            </Button>
          </form>
        )}
      </div>
    </header>
  );
}
