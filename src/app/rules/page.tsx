import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { SEASON_PRIZE_POOL_USD, PRIZE_SPLIT_PERCENT } from "@/lib/prizes";

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
          <p>All ranked matches are best-of-5. Stage hazards off. Standard stock/time settings.</p>
        </Section>

        <Section title="Season prize pool">
          <p>
            The top 5 finishers on the leaderboard when the season ends split a $
            {SEASON_PRIZE_POOL_USD} USD prize pool: 1st gets {PRIZE_SPLIT_PERCENT[0]}%, 2nd{" "}
            {PRIZE_SPLIT_PERCENT[1]}%, 3rd {PRIZE_SPLIT_PERCENT[2]}%, 4th{" "}
            {PRIZE_SPLIT_PERCENT[3]}%, and 5th {PRIZE_SPLIT_PERCENT[4]}%. You need{" "}
            {LEADERBOARD_MIN_GAMES}+ games played to appear on the leaderboard at all.
          </p>
        </Section>

        <Section title="Stage striking — game 1">
          <p>
            Game 1 draws from five stages: Battlefield, Small Battlefield, Pokémon Stadium 2,
            Smashville, and Town and City. A randomly chosen player strikes 1, their opponent
            strikes 2, and the first striker picks the stage from the two that remain.
          </p>
        </Section>

        <Section title="Stage striking — games 2 and beyond">
          <p>
            Three counterpick stages are added — Final Destination, Hollow Bastion, and Kalos
            Pokémon League — for eight total. The winner of the previous game strikes 3, and the
            loser picks the stage from what remains.
          </p>
        </Section>

        <Section title="Room codes">
          <p>
            One player sets the room code per match; it locks to them once set so it can&apos;t be
            silently changed out from under the other player mid-setup.
          </p>
          <p>
            The in-game room password defaults to{" "}
            <span className="font-medium text-foreground">1122</span> for everyone — standardizing
            it means nobody has to communicate a password separately from the room code. If you
            stream, you can set your own in Settings so it isn&apos;t the one password guaranteed
            to be public; your opponent&apos;s lobby card always shows whichever password is
            actually in effect for the host.
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
          <p>
            Reported the wrong winner? Either player can request a correction from their own
            profile page, from the &quot;Wrong result?&quot; link under their most recent match.
            Matching corrections apply immediately and re-run the rating math; a mismatch goes to a
            mod instead. Only available while it&apos;s still both players&apos; most recent
            confirmed match and the season hasn&apos;t ended since.
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
          <p>
            Cancel only works before anything&apos;s happened in the set — once a game has a
            decided winner, or either side has reported one, the match can no longer be canceled.
            At that point, report the result or dispute it instead.
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
            Only a mod acting on a report moves an account toward restriction — filing one is
            never enough by itself. A single report is enough for a mod to suspend or ban if it
            warrants it (a mod can also act directly with no report at all). Suspension blocks
            free battle and filing new reports (so a suspended player can&apos;t retaliate) but
            ranked play stays open, and can be timed (auto-lifts) or indefinite. A ban blocks
            everything. See{" "}
            <a href="/faq" className="underline">
              the Q&amp;A page
            </a>{" "}
            for how appeals work.
          </p>
        </Section>

        <Section title="Matchmaking">
          <p>
            Matchmaking is open worldwide. Set a match region on the Lobby page for the closest
            connection — pick whichever region is physically nearest to you (each option shows
            its reference city), not necessarily your own country — and a match distance — Same
            region only, Nearby (~1,250 mi), Extended (~3,100 mi, the default), Long-range
            (~6,200 mi), or Worldwide. You can also set a
            rating gap — Strict (within 50), Close (within 100), Moderate (within 150), Wide
            (within 300), or Any rating (the default) — and a rematch cooldown — Wait 24, 12, 6,
            3, or 1 hour(s), or Anytime (the default). Distance, rating-gap, and rematch-cooldown
            settings all require BOTH players&apos; choice to cover the actual difference —
            widening yours doesn&apos;t override the other side&apos;s narrower one, so a
            Worldwide/Any rating/Anytime setting still won&apos;t match you with someone who chose
            Same region only, a Strict rating gap, or a 24-hour cooldown. Wired-connection status
            is self-declared and shown on profiles. There&apos;s also an opt-in &quot;only match
            with wired opponents&quot; toggle — like the others, it&apos;s checked per side: if you
            turn it on, opponents without wired toggled on are excluded, and the same applies if
            an opponent has it on and you don&apos;t.
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
