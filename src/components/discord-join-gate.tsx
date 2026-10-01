import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DiscordIcon } from "@/components/discord-icon";
import { signOut } from "@/auth";
import { DISCORD_SERVER_URL } from "@/lib/links";
import { getLang } from "@/lib/i18n";

// Rendered by layout.tsx in place of the page itself for an already-signed-in
// session that isn't (or no longer is) in the Discord server — the same
// requirement auth.ts's signIn callback enforces for a fresh sign-in attempt,
// just shown in place rather than as a redirect since there's no sign-in flow
// to redirect out of here.
export async function DiscordJoinGate() {
  const lang = await getLang();

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-6 py-16">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
          <DiscordIcon className="size-10 text-[#5865F2]" />
          <h1 className="text-xl font-semibold tracking-tight">
            {lang === "es" ? "Únete a nuestro Discord para continuar" : "Join our Discord to continue"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lang === "es"
              ? "Smash Ladder NA ahora requiere estar en nuestro servidor de Discord — es como el staff puede ayudarte si algo sale mal con una partida o una cuenta."
              : "Smash Ladder NA now requires being in our Discord server — it's how staff can actually reach you if something goes wrong with a match or an account."}
          </p>
          <a href={DISCORD_SERVER_URL} target="_blank" rel="noreferrer" className="w-full">
            <Button className="w-full gap-2">
              {lang === "es" ? "Unirse al Discord" : "Join the Discord"}
              <ExternalLink className="size-4" />
            </Button>
          </a>
          <Link href="/" className="w-full">
            <Button type="button" variant="outline" className="w-full">
              {lang === "es" ? "Ya me uní — comprobar de nuevo" : "I've joined — check again"}
            </Button>
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <button type="submit" className="text-xs text-muted-foreground underline">
              {lang === "es" ? "Cerrar sesión" : "Sign out"}
            </button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
