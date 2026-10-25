import { ExternalLink } from "lucide-react";
import { auth, signIn, primaryProviderId } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DiscordIcon } from "@/components/discord-icon";
import { DISCORD_SERVER_URL } from "@/lib/links";
import { getLang } from "@/lib/i18n";
import { SITE_NAME } from "@/lib/site";
import { tr } from "@/lib/lang";

export const metadata = { title: `Join our Discord — ${SITE_NAME}` };

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
            {tr(lang, {
              en: "Join our Discord first",
              es: "Primero únete a nuestro Discord",
              ja: "まず Discord サーバーに参加してください",
            })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tr(lang, {
              en: `You need to be in our Discord server to use ${SITE_NAME} — it's how staff can actually reach you if something goes wrong with a match or an account.`,
              es: `Para usar ${SITE_NAME} necesitas estar en nuestro servidor de Discord — es como el staff puede ayudarte si algo sale mal con una partida o una cuenta.`,
              ja: `${SITE_NAME}を利用するには Discord サーバーへの参加が必要です。対戦やアカウントで問題が起きたときに、運営から連絡を取れるようにするためです。`,
            })}
          </p>
          <a href={DISCORD_SERVER_URL} target="_blank" rel="noreferrer" className="w-full">
            <Button className="w-full gap-2">
              {tr(lang, { en: "Join the Discord", es: "Unirse al Discord", ja: "Discord に参加する" })}
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
                {tr(lang, {
                  en: "I've joined — try again",
                  es: "Ya me uní — intentar de nuevo",
                  ja: "参加しました — もう一度試す",
                })}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
