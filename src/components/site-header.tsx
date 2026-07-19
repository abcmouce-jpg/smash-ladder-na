import Image from "next/image";
import Link from "next/link";
import { Shield, Swords, Trophy, Users } from "lucide-react";
import { auth, signIn, signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Smash Ladder <span className="text-muted-foreground">NA</span>
          </Link>
          {user && (
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link
                href="/lobby"
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Swords className="size-3.5" />
                Lobby
              </Link>
              <Link
                href="/free-battle"
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Users className="size-3.5" />
                Free Battle
              </Link>
              <Link
                href="/leaderboard"
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Trophy className="size-3.5" />
                Leaderboard
              </Link>
              {(user.role === "MOD" || user.role === "ADMIN") && (
                <Link
                  href="/admin/disputes"
                  className="flex items-center gap-1.5 hover:text-foreground"
                >
                  <Shield className="size-3.5" />
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
              <span className="text-sm text-muted-foreground hover:text-foreground hover:underline">
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
