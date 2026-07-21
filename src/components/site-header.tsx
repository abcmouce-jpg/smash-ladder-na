import Image from "next/image";
import Link from "next/link";
import { CalendarClock, Flag, Gamepad2, Gauge, Medal, Shield, Swords, Trophy, Users } from "lucide-react";
import { auth, signIn, signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-2xl items-start justify-between px-6 py-3 md:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-6">
          <Link
            href="/"
            prefetch={false}
            className="flex shrink-0 items-center gap-1.5 text-sm font-semibold tracking-tight"
          >
            <Image src="/smash-icon.webp" alt="" width={24} height={24} className="size-6" />
            Smash Ladder <span className="text-primary">NA</span>
          </Link>
          {user && (
            <div className="relative min-w-0 basis-full md:basis-auto">
              <nav className="flex min-w-0 items-center gap-4 overflow-x-auto text-sm text-muted-foreground [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
              <Link
                href="/lobby"
                prefetch={false}
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Swords className="size-3.5" />
                Lobby
              </Link>
              <Link
                href="/free-battle"
                prefetch={false}
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Users className="size-3.5" />
                Free Battle
              </Link>
              <Link
                href="/leaderboard"
                prefetch={false}
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Trophy className="size-3.5" />
                Leaderboard
              </Link>
              <Link
                href="/characters"
                prefetch={false}
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Gamepad2 className="size-3.5" />
                Characters
              </Link>
              <Link
                href="/tournaments"
                prefetch={false}
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Medal className="size-3.5" />
                Tournaments
              </Link>
              {(user.role === "MOD" || user.role === "ADMIN") && (
                <Link
                  href="/admin"
                  prefetch={false}
                  className="flex items-center gap-1.5 hover:text-foreground"
                >
                  <Gauge className="size-3.5" />
                  Admin
                </Link>
              )}
              {(user.role === "MOD" || user.role === "ADMIN") && (
                <Link
                  href="/admin/disputes"
                  prefetch={false}
                  className="flex items-center gap-1.5 hover:text-foreground"
                >
                  <Shield className="size-3.5" />
                  Disputes
                </Link>
              )}
              {(user.role === "MOD" || user.role === "ADMIN") && (
                <Link
                  href="/admin/reports"
                  prefetch={false}
                  className="flex items-center gap-1.5 hover:text-foreground"
                >
                  <Flag className="size-3.5" />
                  Reports
                </Link>
              )}
              {(user.role === "MOD" || user.role === "ADMIN") && (
                <Link
                  href="/admin/seasons"
                  prefetch={false}
                  className="flex items-center gap-1.5 hover:text-foreground"
                >
                  <CalendarClock className="size-3.5" />
                  Seasons
                </Link>
              )}
              </nav>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent md:hidden"
              />
            </div>
          )}
        </div>

        {user ? (
          <div className="flex items-center gap-3">
            <Link href={`/players/${user.id}`} prefetch={false} className="flex items-center gap-2">
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
              // Land on Lobby specifically, not wherever the sign-in button
              // happened to be clicked — that's where the region prompt is,
              // and a large fraction of sign-ups otherwise never set one
              // (silently blocking themselves from ever queueing).
              await signIn("discord", { redirectTo: "/lobby" });
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
