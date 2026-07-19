export const metadata = { title: "Rules — Smash Ladder NA" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </section>
  );
}

export default function RulesPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Rules</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Covers ranked play. Free battle and start.gg tournaments are separate — see the notes at
        the bottom.
      </p>

      <div className="mt-8 flex flex-col gap-6 text-sm text-muted-foreground">
        <Section title="Format">
          <p>All ranked matches are best-of-3. Stage hazards off. Standard stock/time settings.</p>
        </Section>

        <Section title="Stage striking — game 1">
          <p>
            Game 1 draws from five stages: Final Destination, Battlefield, Small Battlefield,
            Pokémon Stadium 2, and Hollow Bastion. A randomly chosen player strikes 1, their
            opponent strikes 2, and the first striker picks the stage from the two that remain.
          </p>
        </Section>

        <Section title="Stage striking — games 2 and 3">
          <p>
            Two counterpick stages are added — Smashville and Town and City — for seven total.
            The winner of the previous game strikes 2, and the loser picks the stage from what
            remains.
          </p>
        </Section>

        <Section title="Room codes">
          <p>
            One player sets the room code per match; it locks to them once set so it can&apos;t be
            silently changed out from under the other player mid-setup.
          </p>
          <p>
            The in-game room password is always <span className="font-medium text-foreground">1122</span> —
            set every room to this. Standardizing it means nobody has to communicate a password
            separately from the room code.
          </p>
        </Section>

        <Section title="Reporting results">
          <p>
            Both players report the winner after the set. Matching reports confirm the result
            immediately. If reports disagree, the match is flagged as disputed for a mod to
            resolve.
          </p>
          <p>
            If only one player reports and the other never responds, the lone report is accepted
            automatically after 24 hours, and the non-reporting player is charged a no-show. If
            neither player reports within 24 hours, the match closes with no rating impact for
            either side.
          </p>
        </Section>

        <Section title="Canceling a match">
          <p>
            Use the cancel button for legitimate reasons — the opponent disappeared, a real
            emergency came up, or the connection made the set unplayable. Canceling to dodge a
            bad matchup, a rating gap, or an inconvenient character isn&apos;t a legitimate reason,
            and a pattern of it is reportable. Canceled matches carry no rating impact but are
            logged against the canceling player&apos;s account.
          </p>
        </Section>

        <Section title="Character reporting">
          <p>
            After a match, your opponent can optionally report which character you played. This
            feeds the character leaderboard — there&apos;s no self-vote, since a reported character
            from the person you just played is harder to game than a self-declared main.
          </p>
        </Section>

        <Section title="Conduct and reporting misconduct">
          <p>
            Report a match if your opponent no-showed, stalled, disconnected intentionally, or was
            abusive. Reports are reviewed by mods — filing one doesn&apos;t do anything by itself,
            and reporting in bad faith is itself reportable. You can file up to 5 reports per
            hour.
          </p>
          <p>
            Only a mod-confirmed report moves an account toward restriction — accumulating 3
            confirmed reports suspends an account, and 5 bans it. Suspension blocks free battle
            and filing new reports (so a suspended player can&apos;t retaliate) but ranked play
            stays open. A ban blocks everything. See{" "}
            <a href="/faq" className="underline">
              the Q&amp;A page
            </a>{" "}
            for how appeals work.
          </p>
        </Section>

        <Section title="Matchmaking">
          <p>
            &quot;NA&quot; means North America — the US and Canada both. Set a match region before
            you queue — NA East, NA Central, NA West, or Other. Matching is same-region by
            default, for a better connection. If you&apos;d rather queue faster than wait for a
            same-region opponent, opt in to cross-region matching on the Lobby page — matches you
            with anyone regardless of region as soon as either side has opted in. Wired-connection
            status is self-declared too and shown on profiles, though it isn&apos;t part of
            matching.
          </p>
          <p>
            Joining the ranked lobby queues you for up to 10 minutes before the entry expires. You
            can join at most 5 times per minute.
          </p>
        </Section>

        <Section title="Free battle and tournaments">
          <p>
            Free battle posts are unrated, first-come-claimed, and expire after 24 hours — good
            for practice or friendlies without touching your rating. Community tournaments are
            run on start.gg; sign-ups happen here, but bracket rules and disputes for a given
            tournament are set by that tournament&apos;s host.
          </p>
        </Section>
      </div>
    </main>
  );
}
