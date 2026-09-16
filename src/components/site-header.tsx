import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Coffee, LogOut, Settings, UserRound } from "lucide-react";
import { auth, signIn, signOut, primaryProviderId } from "@/auth";
import { Button } from "@/components/ui/button";
import { ThemeMenu } from "@/components/theme-menu";
import { LanguageToggle } from "@/components/language-toggle";
import { MainNav } from "@/components/main-nav";
import { DiscordIcon } from "@/components/discord-icon";
import { DISCORD_SERVER_URL, KOFI_URL } from "@/lib/links";
import { getLang, setLangAction } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;
  const lang = await getLang();
  const role = user?.role;
  const enAction = setLangAction.bind(null, "en");
  const esAction = setLangAction.bind(null, "es");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between gap-3">
          <Link
            href="/"
            prefetch={false}
            className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <Image
              src="/smash_ladder_icon.png"
              alt=""
              width={26}
              height={26}
              className="size-[26px] block dark:hidden"
            />
            <Image
              src="/smash_ladder_icon_white.png"
              alt=""
              width={26}
              height={26}
              className="size-[26px] hidden dark:block"
            />
            <span className="hidden truncate min-[420px]:inline">
              Smash Ladder <span className="text-primary">NA</span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              asChild
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              title={lang === "es" ? "Servidor de Discord" : "Discord server"}
              aria-label={lang === "es" ? "Servidor de Discord" : "Discord server"}
            >
              <a href={DISCORD_SERVER_URL} target="_blank" rel="noreferrer">
                <DiscordIcon className="size-[15px]" />
              </a>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              title={lang === "es" ? "Apóyenos en Ko-fi" : "Support us on Ko-fi"}
              aria-label={lang === "es" ? "Apóyenos en Ko-fi" : "Support us on Ko-fi"}
            >
              <a href={KOFI_URL} target="_blank" rel="noreferrer">
                <Coffee className="size-[15px]" />
              </a>
            </Button>

            <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />

            <ThemeMenu lang={lang} />
            <LanguageToggle lang={lang} enAction={enAction} esAction={esAction} />

            <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="group flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:bg-muted data-[state=open]:text-foreground">
                  {user.image && (
                    <Image
                      src={user.image}
                      alt={user.name ?? "avatar"}
                      width={24}
                      height={24}
                      className="shrink-0 rounded-full"
                    />
                  )}
                  <span className="hidden max-w-32 truncate min-[640px]:inline">{user.name}</span>
                  <ChevronDown className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem asChild>
                    <Link href={`/players/${user.id}`} prefetch={false}>
                      <UserRound className="size-3.5" />
                      {lang === "es" ? "Ver perfil" : "View profile"}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings" prefetch={false}>
                      <Settings className="size-3.5" />
                      {lang === "es" ? "Ajustes" : "Settings"}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <form
                    action={async () => {
                      "use server";
                      await signOut();
                    }}
                  >
                    <DropdownMenuItem asChild>
                      <button type="submit">
                        <LogOut className="size-3.5" />
                        {lang === "es" ? "Cerrar sesión" : "Sign out"}
                      </button>
                    </DropdownMenuItem>
                  </form>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <form
                action={async () => {
                  "use server";
                  // Land on Lobby specifically, not wherever the sign-in button
                  // happened to be clicked — that's where the region prompt is,
                  // and a large fraction of sign-ups otherwise never set one
                  // (silently blocking themselves from ever queueing).
                  await signIn(primaryProviderId, { redirectTo: "/lobby" });
                }}
              >
                <Button type="submit" size="sm">
                  {lang === "es" ? "Iniciar sesión" : "Sign in"}
                </Button>
              </form>
            )}
          </div>
        </div>

        <div className="relative -mx-1 flex items-center gap-4 overflow-x-auto border-t border-border/60 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <MainNav lang={lang} role={role} />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent md:hidden"
          />
        </div>
      </div>
    </header>
  );
}
