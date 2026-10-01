import { ExternalLink } from "lucide-react";
import { auth, signIn, primaryProviderId } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DiscordIcon } from "@/components/discord-icon";
import { DISCORD_SERVER_URL } from "@/lib/links";
import { getLang } from "@/lib/i18n";

export const metadata = { title: "Join our Discord — Smash Ladder NA" };

// Landed on by auth.ts's signIn callback returning this path instead of
// true/false — Auth.js redirects here rather than completing the sign-in,
// so this always means "you tried to sign in but aren't in the server yet,"
// never a page someone browses to directly with an active session.
export default async function JoinDiscordPage() {
  const [session, lang] = await Promise.all([auth(), getLang()]);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-6 py-16">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
          <DiscordIcon className="size-10 text-[#5865F2]" />
          <h1 className="text-xl font-semibold tracking-tight">
            {lang === "es" ? "Primero únete a nuestro Discord" : "Join our Discord first"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lang === "es"
              ? "Para usar Smash Ladder NA necesitas estar en nuestro servidor de Discord — es como el staff puede ayudarte si algo sale mal con una partida o una cuenta."
              : "You need to be in our Discord server to use Smash Ladder NA — it's how staff can actually reach you if something goes wrong with a match or an account."}
          </p>
          <a href={DISCORD_SERVER_URL} target="_blank" rel="noreferrer" className="w-full">
            <Button className="w-full gap-2">
              {lang === "es" ? "Unirse al Discord" : "Join the Discord"}
              <ExternalLink className="size-4" />
            </Button>
          </a>
          {!session?.user && (
            <form
              className="w-full"
              action={async () => {
                "use server";
                await signIn(primaryProviderId, { redirectTo: "/lobby" });
              }}
            >
              <Button type="submit" variant="outline" className="w-full">
                {lang === "es" ? "Ya me uní — intentar de nuevo" : "I've joined — try again"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
