export const metadata = { title: "Q&A — Smash Ladder NA" };

function QA({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{q}</p>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function Category({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Q&amp;A</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        See also the <a href="/rules" className="underline">Rules page</a> for the actual match
        rules this refers back to.
      </p>

      <div className="mt-8 flex flex-col gap-8">
        <Category title="Ranked matches">
          <QA q="My opponent didn't respond after matching. What now?">
            Cancel the match and move on — the cancel button is there for exactly this. If it
            keeps happening with the same player, report them.
          </QA>
          <QA q="I only reported and my opponent never did. Does the match still count?">
            Yes. If your opponent never reports, your report is accepted automatically 24 hours
            after the match started, and they&apos;re charged a no-show. If neither of you
            reports within 24 hours, the match closes with no rating change for either player.
          </QA>
          <QA q="I reported the wrong winner by mistake.">
            Report again with the correct result before your opponent reports — the two of you
            just need to agree. If reports already disagree, the match goes to a mod as a
            dispute.
          </QA>
          <QA q="My opponent reported a different winner than what actually happened.">
            Don&apos;t just resubmit and hope — this puts the match in a disputed state where a
            mod steps in to resolve it based on both reports. If it was deliberate, file a
            conduct report too.
          </QA>
          <QA q="My rating didn't change after a confirmed match.">
            Rounding can occasionally produce a 0-point change at the extreme ends of a rating
            gap — that&apos;s expected, not a bug. If both reports clearly matched and the winner
            looks wrong on your profile, report the match as a dispute.
          </QA>
        </Category>

        <Category title="Character reporting">
          <QA q="My character isn't showing on my profile.">
            It only shows once an opponent reports it after a match — there&apos;s no self-select.
            If you just finished a match, give it a moment; if it&apos;s been a while, your opponent
            may not have reported it.
          </QA>
          <QA q="Someone reported the wrong character for me.">
            One bad report won&apos;t meaningfully skew anything — the character leaderboard looks at
            reports in aggregate. If you think it&apos;s a deliberate pattern of bad-faith reporting,
            file a conduct report on that player.
          </QA>
        </Category>

        <Category title="Conduct, reports, and account status">
          <QA q="Someone was toxic to me outside of a match — Discord DMs, stream chat, etc.">
            The report system covers conduct connected to ranked matches on this site. For
            anything off-platform, block them and, if it&apos;s serious, report it to Discord
            directly.
          </QA>
          <QA q="I reported someone — will you tell me what happened to them?">
            No. We don&apos;t disclose moderation outcomes on individual reports, mainly so reporters
            aren&apos;t identifiable and targeted for retaliation. Filing a report is still the right
            move even without visible confirmation — a single report rarely results in action by
            itself, but a pattern does.
          </QA>
          <QA q="My account was suspended or banned. Why, and can I appeal?">
            We don&apos;t publish the specific reports behind a status change, for the same
            retaliation-prevention reason above. If you think it&apos;s a mistake, reach out to a mod
            or admin in the community Discord server — appeals go through them, not through the
            report system.
          </QA>
          <QA q="What's the actual difference between suspended and banned?">
            Suspended (Level 1) still lets you play ranked — that&apos;s the core activity, and
            disputes already give bad results their own path to correction — but blocks free
            battle and filing new reports, so a suspended player can&apos;t retaliate against whoever
            reported them. Banned (Level 2) blocks everything.
          </QA>
        </Category>

        <Category title="Account">
          <QA q="How do I delete my account?">
            From your profile page, under &quot;Danger zone.&quot; It scrubs your username,
            avatar, and email immediately. See the{" "}
            <a href="/privacy" className="underline">
              Privacy Policy
            </a>{" "}
            for exactly what&apos;s kept and why.
          </QA>
          <QA q="Can I undo an account deletion, or merge it into a new account?">
            No — deletion is permanent and there&apos;s no data migration between accounts. Signing
            back in with the same Discord account afterward just starts a fresh profile.
          </QA>
          <QA q="Is matchmaking open worldwide?">
            Yes — anyone can join. Set your region and a match distance on the Lobby page; the
            defaults match you with same-or-nearby-region players, and you can widen that up to
            Worldwide if you&apos;d rather queue faster. See the Rules page for exactly how the
            distance setting works.
          </QA>
        </Category>

        <Category title="Seasons">
          <QA q="What happens to my rating when a season ends?">
            Standings get snapshotted, then rating and games-played reset for everyone at the
            start of the next season — a clean slate rather than a partial regression, so every
            season starts on equal footing.
          </QA>
        </Category>
      </div>
    </main>
  );
}
