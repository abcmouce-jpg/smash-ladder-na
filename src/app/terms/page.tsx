export const metadata = { title: "Terms of Service — Smash Ladder NA" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated 2026-07-19.</p>

      <div className="mt-8 flex flex-col gap-6 text-sm text-muted-foreground">
        <section>
          <h2 className="text-sm font-medium text-foreground">What this is</h2>
          <p className="mt-2">
            Smash Ladder NA is a community-run ranked ladder for Super Smash Bros., organized
            through Discord sign-in. It&apos;s free to use. By signing in, you agree to these
            terms.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Accounts</h2>
          <p className="mt-2">
            You sign in with Discord — there&apos;s no separate password to manage here. You&apos;re
            responsible for what happens under your account, including matches, reports, and
            posts made from it.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Playing fair</h2>
          <p className="mt-2">
            Report your own match results honestly. Don&apos;t no-show, don&apos;t stall, don&apos;t
            grief opponents, and don&apos;t file conduct reports in bad faith. Ranked matches and
            free battles are between you and your opponent — we don&apos;t referee the actual
            games, only the reporting and matchmaking layer.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Conduct reports and account status</h2>
          <p className="mt-2">
            Other players can report misconduct. Reports are reviewed by mods before any action is
            taken — filing a report alone doesn&apos;t do anything. Accounts that accumulate
            enough mod-confirmed reports get suspended (ranked play only, free battle and new
            reports blocked) or banned (everything blocked), on a graduated scale. See the{" "}
            <a href="/rules" className="underline">
              Rules page
            </a>{" "}
            for specifics. Status decisions can be appealed through a mod or admin in the
            community Discord server.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Tournaments</h2>
          <p className="mt-2">
            Community tournaments are hosted on start.gg; we only handle sign-ups and linking out.
            Bracket rules, disputes, and prizing (if any) for a given tournament are set by that
            tournament&apos;s host, not by us.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Ratings aren&apos;t guarantees</h2>
          <p className="mt-2">
            Ratings, rankings, and match history reflect self-reported and dispute-resolved
            results as best we can determine them. We don&apos;t guarantee accuracy against
            deliberate manipulation, and we can correct or wipe results found to be fraudulent.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">No warranty</h2>
          <p className="mt-2">
            The site is provided as-is. We don&apos;t guarantee uptime, that matchmaking will
            always find you a game, or that the service will be error-free. Nintendo has no
            affiliation with this site — Smash Ladder NA is an independent, fan-run community
            project.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Termination</h2>
          <p className="mt-2">
            You can delete your account at any time from your profile page. We can suspend or ban
            accounts for violating these terms, per the conduct process above.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Changes</h2>
          <p className="mt-2">
            We may update these terms as the site evolves. Material changes will be reflected here
            with an updated date.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Contact</h2>
          <p className="mt-2">
            Questions go to a mod or admin in the community Discord server.
          </p>
        </section>
      </div>
    </main>
  );
}
