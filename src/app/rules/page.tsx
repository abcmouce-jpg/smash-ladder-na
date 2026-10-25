import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { SEASON_PRIZE_POOL_USD, PRIZE_AMOUNTS_USD, approxMxn } from "@/lib/prizes";
import { PRE_SEASON_DURATION_MONTHS, PRE_SEASON_EXPECTED_END_AT } from "@/lib/seasons";
import { getLang } from "@/lib/i18n";
import { trNode } from "@/lib/lang";
import { GEAR_RECOMMENDATIONS } from "@/lib/gear-links";
import { DISPLAY_TIME_ZONE, HAS_PRIZE_POOL, REGION_SET, SITE_NAME } from "@/lib/site";

export const metadata = { title: `Rules — ${SITE_NAME}` };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </section>
  );
}

export default async function RulesPage() {
  const lang = await getLang();
  return trNode(lang, { en: <RulesPageEn />, es: <RulesPageEs />, ja: <RulesPageJa /> });
}

function RulesPageEn() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Rules</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Covers ranked play. Friendlies and start.gg tournaments are separate — see the notes at the bottom.
      </p>

      <div className="mt-8 flex flex-col gap-6 text-sm text-muted-foreground">
        <Section title="Format">
          <p>All ranked matches are best-of-5. Stage hazards off. Standard stock/time settings.</p>
        </Section>

        <Section title="Season prize pool">
          <p>
            The top 3 finishers on the leaderboard when the season ends split a ${SEASON_PRIZE_POOL_USD} USD prize pool:
            1st gets ${PRIZE_AMOUNTS_USD[0]}, 2nd ${PRIZE_AMOUNTS_USD[1]}, and 3rd ${PRIZE_AMOUNTS_USD[2]}. You need{" "}
            {LEADERBOARD_MIN_GAMES}+ sets played to appear on the leaderboard at all.
          </p>
          <p>
            The current preseason is a fixed {PRE_SEASON_DURATION_MONTHS}-month trial run, expected to end around{" "}
            {PRE_SEASON_EXPECTED_END_AT.toLocaleDateString("en-US", {
              timeZone: "America/New_York",
              dateStyle: "long",
            })}
            . Ending a season resets everyone&apos;s rating for the next one.
          </p>
        </Section>

        <Section title="Stage striking — game 1">
          <p>
            Game 1 draws from five stages: Battlefield, Small Battlefield, Pokémon Stadium 2, Smashville, and Town and
            City. A randomly chosen player strikes 1, their opponent strikes 2, and the first striker picks the stage
            from the two that remain.
          </p>
        </Section>

        <Section title="Stage striking — games 2 and beyond">
          <p>
            Three counterpick stages are added — Final Destination, Hollow Bastion, and Kalos Pokémon League — for eight
            total. The winner of the previous game strikes 3, and the loser picks the stage from what remains.
          </p>
        </Section>

        <Section title="Room codes">
          <p>
            One player sets the room code per match; it locks to them once set so it can&apos;t be silently changed out
            from under the other player mid-setup.
          </p>
          <p>
            The in-game room password defaults to <span className="font-medium text-foreground">1122</span> for everyone
            — standardizing it means nobody has to communicate a password separately from the room code. If you stream,
            you can set your own in Settings so it isn&apos;t the one password guaranteed to be public; your
            opponent&apos;s lobby card always shows whichever password is actually in effect for the host.
          </p>
        </Section>

        <Section title="Reporting results">
          <p>
            Both players report the winner after the set. Matching reports confirm the result immediately. If reports on
            a single game disagree, that game is flagged as disputed — the rest of the set isn&apos;t blocked while it
            waits. Either player can then agree with their opponent on who actually won straight from the Lobby, which
            resolves it immediately without a mod; if you still don&apos;t agree, it stays queued for one to rule on.
          </p>
          <p>
            If only one player reports and the other never responds, the lone report is accepted automatically after 3
            hours, and the non-reporting player is charged a no-show — you&apos;ll get a Discord reminder as soon as
            your opponent reports, so you know the clock has started. If you&apos;re already ahead (1-0 or 2-0) and your
            opponent goes fully silent — not even locking in a character for the next game — the set is awarded to you
            once the 3 hours run out, same as if they&apos;d shown up and lost. If neither player has any confirmed game
            wins yet, the match closes with no rating impact for either side instead — if that leaves you stuck after a
            set you actually won, message a mod and they can close it out manually from the Live matches page. A no-show
            (whether from a stale report, never locking in a character, or a set closed out this way) also locks you out
            of queueing again for a bit — 5 minutes the first time, escalating by 5 more minutes each time it happens
            again without a clean 30-day stretch in between.
          </p>
          <p>
            Reported the wrong winner? Either player can request a correction from their own profile page, from the
            &quot;Wrong result?&quot; link under their most recent match. Matching corrections apply immediately and
            re-run the rating math; a mismatch goes to a mod instead. Only available while it&apos;s still both
            players&apos; most recent confirmed match and the season hasn&apos;t ended since.
          </p>
        </Section>

        <Section title="Canceling a match">
          <p>
            The cancel button is free — no rating impact — but only while your opponent genuinely hasn&apos;t shown up
            yet (no chat message, no character locked in, no stage strike, no room code entered). The moment
            they&apos;ve done any of that, the same button becomes
            <strong> Surrender</strong> instead: backing out from then on counts as an actual loss and moves your rating
            exactly like losing the set would. This is deliberate — it&apos;s what stops canceling from being a free way
            to dodge a bad matchup, a rating gap, or an opponent you&apos;d rather not play, while still leaving a real,
            no-cost way out of a match where the other side never showed up at all. The page always tells you which one
            you&apos;re about to click.
          </p>
          <p>
            A free cancel (opponent hasn&apos;t shown up) is still logged against the canceling player&apos;s account. A
            high enough cancel rate triggers an automatic Discord warning, and canceling well beyond that suspends the
            account for 24 hours — ranked play still works while suspended, but posting on Friendlies and filing new
            conduct reports don&apos;t. Surrendering doesn&apos;t count toward this — it already costs rating, so
            there&apos;s no separate penalty on top.
          </p>
          <p>
            Cancelling a lot also affects a self-declared <strong>wired connection</strong> badge specifically, at a
            lower bar than the warning/suspend thresholds above: once your cancels make up more than a quarter of your
            combined cancels-and-games-played (and you&apos;ve cancelled at least 3 times), the badge is cleared
            automatically and you can&apos;t re-declare it until that ratio drops back down. The reasoning is that too
            many cancels make a &quot;my connection is stable&quot; claim unreliable, not that cancelling itself is
            being punished twice — this is separate from, and on top of, the warning/suspend system above. The same
            thing happens if enough opponents file a connection report against you, independent of your own cancel
            history.
          </p>
          <p>
            The free cancel stops working the moment a game has a decided winner or either side has reported one — at
            that point backing out always means Surrender, from either side, for the rest of the set. If your opponent
            goes quiet mid-set instead of surrendering yourself, you generally don&apos;t need to do anything: if they
            stall their stage strikes or final pick, that turn is resolved for them after a few minutes — on game 1
            with a random stage from what&apos;s left, and from game 2 onwards by continuing on the stage the previous
            game was played on, so the set runs it back without erasing anything already decided. Character picks work
            in two phases. Game 1&apos;s blind pick runs on one
            countdown both players share: if it runs out with only one side locked in, the whole set is forfeited to
            whoever locked in, not just the game they were on. From game 2 onwards a missed pick never ends the set —
            whoever stalled falls back to the character they played in the previous game, on that game&apos;s stage,
            while a pick their opponent already made stands. So you carry on playing rather than winning or losing to a
            clock. If you&apos;d rather not wait, or you and your opponent both want to call the whole set off instead,
            either of you can request a mutual cancel from the match screen; once the other side agrees, it cancels
            immediately with no rating impact for either player, no matter how far the set got.
          </p>
        </Section>

        <Section title="Practicing">
          <p>
            Check &quot;Practicing&quot; when you join the queue to keep the set off your main ladder rating entirely —
            wins and losses go to a separate practice rating instead, and your regular rating and sets-played don&apos;t
            move. Practice rating starts at the same 1500 baseline and uses the same math, but it&apos;s a fully
            independent track.
          </p>
          <p>
            Practicing is set per player, not per match — you can queue as practicing against someone who isn&apos;t,
            and vice versa. If you&apos;d rather not face practicing opponents at all, turn on &quot;Don&apos;t match me
            with opponents who are practicing&quot; in Settings.
          </p>
          <p>
            You may not use your main character while practicing. Since practicing shields your own rating from any
            risk, doing this against an opponent who isn&apos;t practicing puts all the risk on them with none on you —
            that&apos;s not a legitimate use of the mode. This isn&apos;t enforced automatically; report it like any
            other conduct issue and a mod will review and can suspend the account.
          </p>
        </Section>

        <Section title="Character reporting">
          <p>
            After a match, your opponent can optionally report which character you played. This feeds the character
            leaderboard — there&apos;s no self-vote, since a reported character from the person you just played is
            harder to game than a self-declared main.
          </p>
        </Section>

        <Section title="Conduct and reporting misconduct">
          <p>
            Report a match if your opponent no-showed, stalled, disconnected intentionally, or was abusive. Reports are
            reviewed by mods — filing one doesn&apos;t do anything by itself, and reporting in bad faith is itself
            reportable. You can file up to 5 reports per hour.
          </p>
          <p>
            Only a mod acting on a report moves an account toward restriction — filing one is never enough by itself. A
            single report is enough for a mod to suspend or ban if it warrants it (a mod can also act directly with no
            report at all). Suspension blocks posting on Friendlies and filing new reports (so a suspended player
            can&apos;t retaliate) but ranked play stays open, and can be timed (auto-lifts) or indefinite. A ban blocks
            everything. See{" "}
            <a href="/faq" className="underline">
              the Q&amp;A page
            </a>{" "}
            for how appeals work.
          </p>
        </Section>

        <Section title="Matchmaking">
          <p>
            Matchmaking is open worldwide. Set a match region on the Lobby page for the closest connection — pick
            whichever region is physically nearest to you, not necessarily your own country. US and Canada can be set
            down to the state/province level; the broader regions (some shown with a reference city) still work too, and
            everyone else gets a broader region — and a match distance — Same region only, Nearby (~1,250 mi), Extended
            (~3,100 mi, the default), Long-range (~6,200 mi), or Worldwide. You can also set a rating gap — Strict
            (within 50), Close (within 100), Moderate (within 150), Wide (within 300), or Any rating (the default) — and
            a rematch cooldown — Wait 24, 12, 6, 3, or 1 hour(s), or Anytime (the default). Distance, rating-gap, and
            rematch-cooldown settings all require BOTH players&apos; choice to cover the actual difference — widening
            yours doesn&apos;t override the other side&apos;s narrower one, so a Worldwide/Any rating/Anytime setting
            still won&apos;t match you with someone who chose Same region only, a Strict rating gap, or a 24-hour
            cooldown. Wired-connection status is self-declared and shown on profiles. There&apos;s also an opt-in
            &quot;only match with wired opponents&quot; toggle — like the others, it&apos;s checked per side: if you
            turn it on, opponents without wired toggled on are excluded, and the same applies if an opponent has it on
            and you don&apos;t.
          </p>
          <p>
            Joining the ranked lobby queues you until you&apos;re matched or you leave — your spot stays alive as long
            as you keep the site open, and only lapses after 10 minutes with no activity. You can join at most 5 times
            per minute.
          </p>
        </Section>

        <Section title="Friendlies and tournaments">
          <p>
            Friendlies posts are unrated, first-come-claimed, and expire after 24 hours — good for practice or casual
            games without touching your rating. Community tournaments are run on start.gg; sign-ups happen here, but
            bracket rules and disputes for a given tournament are set by that tournament&apos;s host.
          </p>
        </Section>

        <Section title="Recommended gear for wired play">
          <p>
            Getting a real wired connection (for the badge above) usually means a USB-C-to-Ethernet adapter if
            you&apos;re playing undocked, or just an Ethernet cable into the dock. A GameCube controller is the other
            common upgrade competitive players make.
          </p>
          <ul className="list-inside list-disc">
            {GEAR_RECOMMENDATIONS.map((item) => (
              <li key={item.url}>
                <a href={item.url} target="_blank" rel="noopener noreferrer sponsored" className="underline">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs">
            As an Amazon Associate, we earn from qualifying purchases — these are regular Amazon search links, not
            specific product endorsements.
          </p>
        </Section>
      </div>
    </main>
  );
}

// Japanese copy. Not a line-by-line translation of the English page: the
// matchmaking section describes the presets without numbers (the JP instance
// has its own km-based list — see JP_DISTANCE_PRESETS in lib/regions.ts) and
// the prize pool paragraph follows HAS_PRIZE_POOL, which is off on the JP
// instance.
function RulesPageJa() {
  const endDate = PRE_SEASON_EXPECTED_END_AT.toLocaleDateString("ja-JP", {
    timeZone: DISPLAY_TIME_ZONE,
    dateStyle: "long",
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">ルール</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        ランクマッチについてのルールです。フリー対戦と start.gg の大会は別扱いです（ページ下部を参照してください）。
      </p>

      <div className="mt-8 flex flex-col gap-6 text-sm text-muted-foreground">
        <Section title="形式">
          <p>ランクマッチはすべて3本先取（BO5）です。ステージギミックはオフ、ストック・時間は標準設定です。</p>
        </Section>

        <Section title={HAS_PRIZE_POOL ? "シーズン賞金" : "シーズン"}>
          {HAS_PRIZE_POOL && (
            <p>
              シーズン終了時にランキング上位3名で ${SEASON_PRIZE_POOL_USD} USD の賞金を分配します。1位は $
              {PRIZE_AMOUNTS_USD[0]}、2位は ${PRIZE_AMOUNTS_USD[1]}、3位は ${PRIZE_AMOUNTS_USD[2]}
              です。ランキングに表示されるには {LEADERBOARD_MIN_GAMES} セット以上の対戦が必要です。
            </p>
          )}
          <p>
            現在のプレシーズンは {PRE_SEASON_DURATION_MONTHS} ヶ月の試験期間で、{endDate}
            頃に終了する予定です。シーズンが終わると、次のシーズンに向けて全員のレートがリセットされます。
          </p>
        </Section>

        <Section title="ステージ BAN — 第1試合">
          <p>
            第1試合は 戦場・小戦場・ポケモンスタジアム2・すま村・村と街 の5ステージから選びます。ランダムに選ばれたプレイヤーが1つ
            BAN し、相手が2つ BAN したあと、最初に BAN したプレイヤーが残り2つからステージを選びます。
          </p>
        </Section>

        <Section title="ステージ BAN — 第2試合以降">
          <p>
            カウンターピック用の 終点・ホロウバスティオン・カロスポケモンリーグ の3ステージが加わり、全8ステージになります。前の試合の勝者が3つ
            BAN し、敗者が残りからステージを選びます。
          </p>
        </Section>

        <Section title="部屋ID">
          <p>
            部屋IDは試合ごとにどちらか一方が設定します。一度設定するとそのプレイヤーに固定されるため、準備中に相手の知らないうちに書き換えられることはありません。
          </p>
          <p>
            ゲーム内の部屋のパスワードは、全員共通で <span className="font-medium text-foreground">1122</span>{" "}
            が初期設定です。共通にしておくことで、部屋IDとは別にパスワードを伝える手間がなくなります。配信をしている方は、誰でも知っているパスワードにならないよう設定で自分用のものに変更できます。相手のロビー画面には、ホストが実際に使っているパスワードが常に表示されます。
          </p>
        </Section>

        <Section title="結果の報告">
          <p>
            セット終了後、両者が勝者を報告します。報告が一致すればすぐに結果が確定します。ある試合の報告が食い違った場合、その試合だけが異議申立として扱われ、セットの残りの進行は止まりません。どちらのプレイヤーもロビーから相手の報告に合意すれば、モデレーターを待たずにすぐ解決します。それでも合意できない場合は、モデレーターの判定待ちになります。
          </p>
          <p>
            片方だけが報告して相手が応答しない場合、その報告は3時間後に自動で承認され、報告しなかった側には放置（ノーショー）が記録されます。相手が報告した時点で
            Discord にリマインダーが届くので、期限が始まったことがわかります。すでにリードしている（1-0 または
            2-0）状態で相手が完全に応答しなくなった場合（次の試合のキャラ選択すらしない場合）も、3時間経てばセットはあなたの勝ちになります。相手が出てきて負けた場合と同じ扱いです。どちらもまだ1試合も勝ちが確定していない場合は、両者ともレートに影響なく試合が終了します。実際には勝っていたのにこれで困った場合は、モデレーターに連絡してください。ライブ試合のページから手動で確定できます。放置（報告の放置、キャラ未選択、上記のように終了したセットのいずれでも）があると、しばらくの間マッチングに参加できなくなります。初回は5分で、30日間問題なく過ごす前に繰り返すたびに5分ずつ延びていきます。
          </p>
          <p>
            勝者を間違えて報告した場合は、どちらのプレイヤーも自分のプロフィールページの直近の試合の下にある「結果が間違っていますか？」リンクから修正を申請できます。両者の修正内容が一致すればすぐに反映され、レートも再計算されます。一致しない場合はモデレーターの確認に回ります。修正できるのは、その試合が両者にとって直近の確定済みの試合であり、かつその後シーズンが終わっていない場合に限ります。
          </p>
        </Section>

        <Section title="試合のキャンセル">
          <p>
            キャンセルボタンは、相手がまだ本当に来ていない間（チャットの発言、キャラ選択、ステージ BAN、部屋IDの入力がどれもない間）だけ、レートに影響なく使えます。相手がそのどれか1つでも行った時点で、同じボタンは
            <strong>降参</strong>
            に変わります。それ以降に抜けると正式な敗北となり、セットに負けたときと同じだけレートが動きます。これは意図的な仕様です。苦手なキャラ相手、レート差、当たりたくない相手から無償で逃げる手段としてキャンセルが使われるのを防ぎつつ、相手がまったく来なかった試合からは本当にノーリスクで抜けられるようにしています。どちらのボタンを押そうとしているかは、画面に常に表示されます。
          </p>
          <p>
            無償のキャンセル（相手が来ていない場合）でも、キャンセルした側のアカウントには記録が残ります。キャンセル率が一定以上になると
            Discord で自動的に警告が届き、それを大きく超えると24時間アカウントが利用停止になります。利用停止中もランクマッチは遊べますが、フリー対戦への投稿と新しい通報はできません。降参はこの集計に含まれません。すでにレートで代償を払っているため、別途ペナルティは課されません。
          </p>
          <p>
            キャンセルが多いと、自己申告の<strong>有線接続</strong>
            バッジにも影響します。基準は上の警告・利用停止よりも低く、キャンセル数がキャンセル数と対戦数の合計の4分の1を超えた場合（かつキャンセルが3回以上の場合）、バッジは自動的に外れ、その割合が下がるまで再申告できません。これはキャンセル自体を二重に罰するためではなく、キャンセルが多いと「回線が安定している」という申告が信用できなくなるためです。上の警告・利用停止とは別の仕組みとして、それに加えて適用されます。自分のキャンセル履歴とは関係なく、十分な数の相手から回線の報告を受けた場合も同じことが起こります。
          </p>
          <p>
            無償のキャンセルは、いずれかの試合で勝者が決まった時点、またはどちらかが勝者を報告した時点で使えなくなります。それ以降はセットが終わるまで、どちらの側から抜けても必ず降参になります。セットの途中で相手が反応しなくなっても、自分から降参する必要は基本的にありません。相手がステージ
            BAN や最終選択を放置した場合、数分後に相手の手番が自動で処理されます。第1試合では残りのステージからランダムに選ばれ、第2試合以降は前の試合のステージでそのまま続行するため、すでに決まった結果が消えることはありません。キャラ選択は2段階です。第1試合のブラインドピックは両者共通のカウントダウンで行われ、時間切れの時点で片方しか選んでいなければ、その試合だけでなくセット全体が選んだ側の勝ちになります。第2試合以降は、選択を逃してもセットが終わることはありません。放置した側は前の試合で使ったキャラ・前の試合のステージになり、相手がすでに選んだキャラはそのまま使われます。つまり時間切れで勝ち負けが決まるのではなく、対戦がそのまま続きます。待ちたくない場合や、両者ともセット自体を取りやめたい場合は、どちらからでも試合画面から合意キャンセルを申請できます。相手が同意すれば、セットの進行状況に関係なく、両者ともレートに影響なくすぐにキャンセルされます。
          </p>
        </Section>

        <Section title="練習モード">
          <p>
            マッチング待機時に「練習」にチェックを入れると、そのセットはメインのラダーのレートに一切影響しません。勝敗は別枠の練習用レートに反映され、通常のレートやセット数は変わりません。練習用レートも同じ1500から始まり、計算方法も同じですが、完全に独立しています。
          </p>
          <p>
            練習モードは試合ごとではなくプレイヤーごとの設定です。練習モードでない相手と練習モードで当たることも、その逆もあります。練習モードの相手と当たりたくない場合は、設定で「練習中の相手とはマッチしない」をオンにしてください。
          </p>
          <p>
            練習モードではメインキャラを使ってはいけません。練習モードは自分のレートをリスクから守るものなので、練習モードでない相手にこれを行うと、リスクをすべて相手だけに負わせることになり、正当な使い方とは言えません。自動では取り締まっていませんが、ほかのマナー違反と同じように通報してください。モデレーターが確認し、アカウントを利用停止にする場合があります。
          </p>
        </Section>

        <Section title="使用キャラの報告">
          <p>
            試合後、相手はあなたが使ったキャラを任意で報告できます。これはキャラ別ランキングに使われます。自己申告はありません。自分で申告するメインキャラよりも、直前に対戦した相手からの報告のほうがごまかしにくいためです。
          </p>
        </Section>

        <Section title="マナーと迷惑行為の通報">
          <p>
            相手が来なかった、遅延行為をした、意図的に切断した、暴言を吐いた場合は、その試合を通報してください。通報はモデレーターが確認します。通報しただけで何かが起こるわけではなく、悪意のある通報自体も通報の対象になります。通報は1時間に5件までです。
          </p>
          <p>
            アカウントが制限に向かうのは、モデレーターが通報をもとに対応した場合だけです。通報しただけで制限されることはありません。内容によっては、1件の通報でモデレーターが利用停止や
            BAN を行うこともあります（通報がなくてもモデレーターが直接対応する場合もあります）。利用停止中はフリー対戦への投稿と新しい通報ができなくなります（利用停止になったプレイヤーが報復できないようにするため）が、ランクマッチは引き続き遊べます。利用停止には期間付き（自動で解除）と無期限があります。BAN
            はすべての機能が使えなくなります。異議申し立ての方法については{" "}
            <a href="/faq" className="underline">
              Q&amp;A ページ
            </a>{" "}
            を参照してください。
          </p>
        </Section>

        <Section title="マッチング">
          {REGION_SET === "jp" ? (
            <p>
              ロビーのページで対戦地域を設定すると、できるだけ回線の近い相手とマッチします。地域は都道府県単位で、住んでいる場所ではなく物理的に一番近いところを選んでください。対戦距離は「同じ都道府県のみ」から「全国・海外」まで段階的に選べます。
            </p>
          ) : (
            <p>
              マッチングは世界中に開かれています。ロビーのページで対戦地域を設定すると、できるだけ回線の近い相手とマッチします。自分の国である必要はなく、物理的に一番近い地域を選んでください。アメリカとカナダは州単位まで設定でき、それ以外の地域はより広い単位になります。対戦距離は「同じ地域のみ」から「全世界」まで段階的に選べます。
            </p>
          )}
          <p>
            ほかに、許容するレート差（「すべてのレート」が初期設定）と、同じ相手との再戦の間隔（「いつでも」が初期設定）も設定できます。対戦距離・レート差・再戦の間隔は、どれも両者の設定が実際の差をカバーしている場合にだけマッチします。自分の設定を広げても相手の狭い設定は上書きされないため、自分が最も広い設定にしていても、相手が最も狭い設定を選んでいればマッチしません。有線接続かどうかは自己申告で、プロフィールに表示されます。任意で「有線接続の相手のみとマッチする」をオンにすることもできます。これもほかの設定と同じく両者それぞれに適用され、自分がオンにしていれば有線でない相手は除外され、相手がオンにしていて自分が有線でない場合も同様です。
          </p>
          <p>
            ランクマッチのロビーに参加すると、マッチするか退出するまで待機が続きます。サイトを開いている限り待機は続き、10分間操作がない場合にのみ解除されます。参加は1分間に5回までです。
          </p>
        </Section>

        <Section title="フリー対戦と大会">
          <p>
            フリー対戦の募集はレートに影響せず、先着順で、24時間で期限切れになります。レートを気にせず練習や気軽な対戦をしたいときに便利です。コミュニティ大会は
            start.gg で開催されます。参加登録はこのサイトで行いますが、各大会のルールや揉め事の判断はその大会の主催者が決めます。
          </p>
        </Section>

        <Section title="有線接続におすすめの機材">
          <p>
            有線接続（上のバッジ用）にするには、携帯モードなら USB-C 有線LANアダプター、ドックを使うなら LAN
            ケーブルを挿すだけで済むことがほとんどです。対戦勢がよく取り入れるもう1つのアイテムは、ゲームキューブコントローラーです。
          </p>
          <ul className="list-inside list-disc">
            {GEAR_RECOMMENDATIONS.map((item) => (
              <li key={item.url}>
                <a href={item.url} target="_blank" rel="noopener noreferrer sponsored" className="underline">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs">
            Amazon アソシエイトとして、適格販売により収入を得ています。これらは通常の Amazon
            検索リンクであり、特定の商品をおすすめするものではありません。
          </p>
        </Section>
      </div>
    </main>
  );
}

function RulesPageEs() {
  const endDate = PRE_SEASON_EXPECTED_END_AT.toLocaleDateString("es-MX", {
    timeZone: "America/New_York",
    dateStyle: "long",
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Reglas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cubre el juego rankeado. Amistosos y los torneos de start.gg son aparte — ver las notas al final.
      </p>

      <div className="mt-8 flex flex-col gap-6 text-sm text-muted-foreground">
        <Section title="Formato">
          <p>
            Todas las partidas rankeadas son al mejor de 5. Hazards de escenario desactivados. Configuración estándar de
            stocks/tiempo.
          </p>
        </Section>

        <Section title="Bolsa de premios de temporada">
          <p>
            Los 3 primeros en la tabla de posiciones cuando termina la temporada se reparten una bolsa de $
            {SEASON_PRIZE_POOL_USD} USD (≈ ${approxMxn(SEASON_PRIZE_POOL_USD).toLocaleString("es-MX")} MXN, solo de
            referencia — el pago siempre se hace en USD por PayPal): 1° recibe ${PRIZE_AMOUNTS_USD[0]}, 2°{" "}
            ${PRIZE_AMOUNTS_USD[1]}, y 3° ${PRIZE_AMOUNTS_USD[2]}. Necesitas {LEADERBOARD_MIN_GAMES}+ partidas jugadas
            para aparecer en la tabla de posiciones.
          </p>
          <p>
            La preseason actual es una prueba fija de {PRE_SEASON_DURATION_MONTHS} meses, con fin estimado alrededor del{" "}
            {endDate}. Terminar una temporada reinicia la clasificación de todos para la siguiente.
          </p>
        </Section>

        <Section title="Descarte de escenario — juego 1">
          <p>
            El juego 1 se elige entre cinco escenarios: Battlefield, Small Battlefield, Pokémon Stadium 2, Smashville, y
            Town and City. Un jugador elegido al azar descarta 1, su rival descarta 2, y el primero en descartar elige
            el escenario entre los dos que quedan.
          </p>
        </Section>

        <Section title="Descarte de escenario — juego 2 en adelante">
          <p>
            Se añaden tres escenarios de contra-selección — Final Destination, Hollow Bastion, y Kalos Pokémon League —
            para ocho en total. Quien ganó el juego anterior descarta 3, y quien perdió elige el escenario entre lo que
            queda.
          </p>
        </Section>

        <Section title="Códigos de sala">
          <p>
            Un jugador define el código de sala por partida; queda fijado a esa persona una vez establecido, para que no
            pueda cambiarse a escondidas a mitad de la preparación.
          </p>
          <p>
            La contraseña de la sala dentro del juego es <span className="font-medium text-foreground">1122</span> por
            defecto para todos — estandarizarla significa que nadie tiene que comunicar una contraseña aparte del código
            de sala. Si transmites en vivo, puedes poner la tuya propia en Ajustes para que no sea la única contraseña
            garantizada como pública; la tarjeta de sala de tu rival siempre muestra la contraseña que realmente está en
            uso para quien organiza.
          </p>
        </Section>

        <Section title="Reportar resultados">
          <p>
            Ambos jugadores reportan quién ganó después de la partida. Si los reportes coinciden, el resultado se
            confirma de inmediato. Si los reportes sobre un juego no coinciden, ese juego queda marcado como en disputa
            — el resto de la partida no se bloquea mientras espera. Cualquiera de los dos puede entonces ponerse de
            acuerdo con su rival sobre quién ganó realmente directamente desde la Sala, lo que lo resuelve
            inmediatamente sin un mod; si aún no están de acuerdo, queda en cola para que un mod decida.
          </p>
          <p>
            Si solo un jugador reporta y el otro nunca responde, el reporte único se acepta automáticamente después de 3
            horas, y al jugador que no reportó se le marca un no-show — recibirás un recordatorio por Discord en cuanto
            tu rival reporte, para que sepas que el reloj ya empezó. Si ya vas ganando (1-0 o 2-0) y tu rival desaparece
            por completo — sin siquiera elegir personaje para el siguiente juego — la partida se te otorga en cuanto
            pasan las 3 horas, igual que si se hubiera presentado y hubiera perdido. Si ningún jugador tiene aún ningún
            juego confirmado como ganado, la partida se cierra sin afectar la clasificación de ninguno de los dos — si
            eso te deja atorado después de una partida que en verdad ganaste, escríbele a un mod y puede cerrarla
            manualmente desde la página de partidas en vivo. Un no-show (ya sea por un reporte vencido, no elegir
            personaje nunca, o una partida cerrada de esta forma) también te bloquea de volver a entrar a la cola por un
            rato — 5 minutos la primera vez, subiendo 5 minutos más cada vez que vuelve a pasar sin un tramo limpio de
            30 días entre medio.
          </p>
          <p>
            ¿Reportaste al ganador equivocado? Cualquiera de los dos jugadores puede pedir una corrección desde su
            propia página de perfil, en el enlace &quot;¿Resultado incorrecto?&quot; bajo su partida confirmada más
            reciente. Si las correcciones coinciden se aplican de inmediato y se recalcula la clasificación; si no
            coinciden, va a un mod. Solo disponible mientras siga siendo la partida confirmada más reciente de ambos
            jugadores y la temporada no haya terminado desde entonces.
          </p>
        </Section>

        <Section title="Cancelar una partida">
          <p>
            El botón de cancelar es gratis — sin afectar la clasificación — pero solo mientras tu rival realmente no se
            haya presentado (sin mensaje de chat, sin personaje elegido, sin descarte de escenario, sin código de sala
            ingresado). En el momento que haya hecho cualquiera de esas cosas, ese mismo botón se convierte en{" "}
            <strong>Rendirse</strong> en su lugar: retirarse a partir de ahí cuenta como una derrota real y mueve tu
            clasificación exactamente igual que perder la partida. Esto es deliberado — es lo que evita que cancelar sea
            una forma gratuita de esquivar un mal matchup, una diferencia de clasificación, o un rival que preferirías
            no enfrentar, mientras sigue dejando una salida real y sin costo cuando el otro lado simplemente nunca se
            presentó. La página siempre te dice cuál de los dos estás a punto de presionar.
          </p>
          <p>
            Una cancelación gratuita (el rival no se presentó) igual queda registrada en la cuenta de quien cancela. Una
            tasa de cancelación demasiado alta activa una advertencia automática por Discord, y cancelar bastante más
            allá de eso suspende la cuenta por 24 horas — el juego rankeado sigue funcionando mientras estás suspendido,
            pero publicar en Amistosos y presentar nuevos reportes de conducta no. Rendirse no cuenta para esto — ya
            cuesta clasificación, así que no hay una penalización aparte encima.
          </p>
          <p>
            Cancelar mucho también afecta específicamente a la insignia autodeclarada de{" "}
            <strong>conexión por cable</strong>, con un umbral más bajo que las advertencias/ suspensiones de arriba: en
            cuanto tus cancelaciones superen una cuarta parte de tus cancelaciones-más-partidas-jugadas combinadas (y
            hayas cancelado al menos 3 veces), la insignia se quita automáticamente y no puedes volver a declararla
            hasta que esa proporción baje. La razón es que demasiadas cancelaciones hacen poco confiable la afirmación
            de &quot;mi conexión es estable&quot;, no que se esté castigando dos veces el cancelar en sí — esto es
            aparte de, y además de, el sistema de advertencia/ suspensión de arriba. Lo mismo pasa si suficientes
            rivales presentan un reporte de conexión en tu contra, independientemente de tu propio historial de
            cancelaciones.
          </p>
          <p>
            La cancelación gratuita deja de funcionar en cuanto un juego tiene un ganador decidido o cualquiera de los
            dos lados ha reportado uno — a partir de ahí, retirarse siempre significa Rendirse, desde cualquiera de los
            dos lados, por el resto de la partida. Si tu rival se queda callado a mitad de la partida en vez de rendirse
            tú mismo, en general no necesitas hacer nada: un rival que no responde pierde automáticamente su turno
            después de unos minutos (elección de personaje o descarte de escenario, lo que sea que tenga pendiente) y la
            partida continúa sin borrar nada ya decidido. La elección de personaje tiene dos fases. La elección a ciegas
            del juego 1 corre con un único contador compartido por ambos: si se agota con solo un lado bloqueado, el set
            completo se le concede a quien sí eligió — no solo el juego en el que estaban. Del juego 2 en adelante una
            elección perdida nunca termina el set: quien se quedó sin elegir vuelve al personaje que jugó en el juego
            anterior, en el escenario de ese juego, mientras que la elección que su rival ya hizo se mantiene. Así
            sigues jugando en vez de ganar o perder por reloj. Si prefieres no esperar, o tú y tu rival quieren cancelar
            toda la partida de mutuo acuerdo, cualquiera de los dos puede pedir una cancelación mutua desde la pantalla
            de partida; en cuanto el otro lado acepta, se cancela de inmediato sin afectar la clasificación de ninguno,
            sin importar qué tan avanzada estuviera la partida.
          </p>
        </Section>

        <Section title="Modo práctica">
          <p>
            Marca &quot;Practicando&quot; al entrar a la cola para que la partida no afecte en absoluto tu clasificación
            principal — las victorias y derrotas van a una clasificación de práctica aparte, y tu clasificación y
            partidas jugadas normales no se mueven. La clasificación de práctica empieza en la misma base de 1500 y usa
            las mismas matemáticas, pero es un track totalmente independiente.
          </p>
          <p>
            El modo práctica se define por jugador, no por partida — puedes entrar a la cola en modo práctica contra
            alguien que no lo esté, y viceversa. Si prefieres no enfrentar rivales en modo práctica en absoluto, activa
            &quot;No emparejarme con rivales que están practicando&quot; en Ajustes.
          </p>
        </Section>

        <Section title="Reportar personaje">
          <p>
            Después de una partida, tu rival puede opcionalmente reportar qué personaje usaste. Esto alimenta la tabla
            de posiciones por personaje — no hay autovoto, ya que un personaje reportado por la persona contra la que
            acabas de jugar es más difícil de manipular que un main autodeclarado.
          </p>
        </Section>

        <Section title="Conducta y reportar mala conducta">
          <p>
            Reporta una partida si tu rival no se presentó, alargó la partida innecesariamente, se desconectó a
            propósito, o fue abusivo. Los reportes son revisados por mods — presentar uno no hace nada por sí solo, y
            reportar de mala fe es en sí mismo reportable. Puedes presentar hasta 5 reportes por hora.
          </p>
          <p>
            Solo la acción de un mod sobre un reporte mueve una cuenta hacia una restricción — presentar uno nunca es
            suficiente por sí solo. Un solo reporte es suficiente para que un mod suspenda o banee si lo amerita (un mod
            también puede actuar directamente sin ningún reporte). La suspensión bloquea publicar en Amistosos y
            presentar nuevos reportes (para que un jugador suspendido no pueda tomar represalias) pero el juego rankeado
            sigue disponible, y puede ser temporal (se levanta sola) o indefinida. Un ban bloquea todo. Consulta{" "}
            <a href="/faq" className="underline">
              la página de Preguntas
            </a>{" "}
            para ver cómo funcionan las apelaciones.
          </p>
        </Section>

        <Section title="Emparejamiento">
          <p>
            El emparejamiento está abierto a nivel mundial. Define una región de partida en la página de Sala para la
            conexión más cercana — elige la región que esté físicamente más cerca de ti, no necesariamente tu propio
            país. Estados Unidos y Canadá se pueden definir hasta nivel estado/provincia; las regiones más amplias
            (algunas con una ciudad de referencia) también funcionan, y todos los demás obtienen una región más amplia —
            y una distancia de partida — Solo la misma región, Cercana (~1,250 mi), Extendida (~3,100 mi, la opción por
            defecto), Larga distancia (~6,200 mi), o Mundial. También puedes definir una diferencia de clasificación —
            Estricta (dentro de 50), Cercana (dentro de 100), Moderada (dentro de 150), Amplia (dentro de 300), o
            Cualquier clasificación (por defecto) — y un tiempo de espera para revancha — Esperar 24, 12, 6, 3, o 1
            hora(s), o Cuando sea (por defecto). Los ajustes de distancia, diferencia de clasificación, y tiempo de
            espera para revancha requieren que la elección de AMBOS jugadores cubra la diferencia real — ampliar el tuyo
            no anula el más estricto del otro lado, así que un ajuste de Mundial/Cualquier clasificación/Cuando sea
            igual no te emparejará con alguien que eligió Solo la misma región, una diferencia de clasificación
            Estricta, o un tiempo de espera de 24 horas. El estado de conexión por cable es autodeclarado y se muestra
            en los perfiles. También hay un interruptor opcional de &quot;solo emparejar con rivales por cable&quot; —
            como los demás, se revisa por cada lado: si lo activas, se excluyen los rivales que no tengan el suyo
            activado, y lo mismo aplica si un rival lo tiene activado y tú no.
          </p>
          <p>
            Entrar a la sala rankeada te pone en cola hasta que te emparejen o salgas — tu lugar se mantiene mientras
            tengas el sitio abierto, y solo se pierde tras 10 minutos sin actividad. Puedes entrar como máximo 5 veces
            por minuto.
          </p>
        </Section>

        <Section title="Amistosos y torneos">
          <p>
            Las publicaciones de Amistosos no afectan la clasificación, se reclaman por orden de llegada, y expiran
            después de 24 horas — buenas para practicar o jugar casual sin tocar tu clasificación. Los torneos de la
            comunidad se organizan en start.gg; las inscripciones ocurren aquí, pero las reglas de bracket y disputas de
            un torneo específico las define quien organiza ese torneo.
          </p>
        </Section>

        <Section title="Equipo recomendado para jugar por cable">
          <p>
            Para tener una conexión por cable real (para la insignia de arriba) normalmente necesitas un adaptador
            USB-C a Ethernet si juegas sin el dock, o simplemente un cable Ethernet al dock. Un control de GameCube es
            la otra mejora común entre jugadores competitivos.
          </p>
          <ul className="list-inside list-disc">
            {GEAR_RECOMMENDATIONS.map((item) => (
              <li key={item.url}>
                <a href={item.url} target="_blank" rel="noopener noreferrer sponsored" className="underline">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs">
            Como Afiliado de Amazon, ganamos por compras que califican — son enlaces normales de búsqueda en Amazon, no
            recomendaciones de un producto específico.
          </p>
        </Section>
      </div>
    </main>
  );
}
