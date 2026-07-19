export const metadata = { title: "Privacy Policy — Smash Ladder NA" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated 2026-07-19.</p>

      <div className="mt-8 flex flex-col gap-6 text-sm text-muted-foreground">
        <section>
          <h2 className="text-sm font-medium text-foreground">What we collect</h2>
          <p className="mt-2">
            When you sign in with Discord, we receive your Discord user ID, username, avatar, and
            (if you&apos;ve made it available) email address. We don&apos;t see your Discord
            password or anything outside what Discord&apos;s OAuth consent screen shows you.
          </p>
          <p className="mt-2">
            Beyond that, we store what you generate by using the site: ranked matches and
            results, free battle posts, match comments, tournament sign-ups, conduct reports you
            file or receive, and anything you self-declare (region, wired-connection status,
            main character).
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">How we use it</h2>
          <p className="mt-2">
            To run the ladder: matchmaking, rating calculations, leaderboards, match history, and
            moderation (conduct reports, disputes, account status). If a Discord bot token is
            configured, we also DM you about match and tournament events — this only works if the
            bot and you share a Discord server, per Discord&apos;s own restriction.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Who else sees it</h2>
          <p className="mt-2">
            Discord (for sign-in and, optionally, DM notifications) and Neon (our database host)
            process your data on our behalf. We don&apos;t sell your data.
          </p>
          <p className="mt-2">
            Some read-only pages (leaderboard, characters, tournaments, free battle) may show ads
            served by Google AdSense. AdSense can set its own cookies and use data about your
            visits to this and other sites to serve and measure ads — this isn&apos;t data we
            collect or control ourselves. You can see and adjust what Google uses for ad
            personalization at{" "}
            <a
              href="https://adssettings.google.com"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              adssettings.google.com
            </a>
            . We don&apos;t place ads on the lobby or an active match — that experience stays
            ad-free.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Cookies</h2>
          <p className="mt-2">
            One session cookie, used only to keep you signed in. On pages where an ad is shown,
            Google AdSense may also set its own cookies, per the section above — otherwise no
            tracking or advertising cookies are set.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Deleting your account</h2>
          <p className="mt-2">
            From your profile page, you can delete your account at any time. This removes your
            username, avatar, and email immediately. Match results stay on the ladder, anonymized
            — they involve other players&apos; legitimate win/loss records too, so we don&apos;t
            erase those, but nothing in them will be traceable back to you.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Age</h2>
          <p className="mt-2">
            You need a Discord account to use this site, so you already meet Discord&apos;s own
            minimum age (13+). We don&apos;t knowingly collect data from anyone younger than that.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Questions</h2>
          <p className="mt-2">
            Reach out to a mod or admin in the community Discord server, or via the site&apos;s
            listed contact.
          </p>
        </section>
      </div>
    </main>
  );
}
