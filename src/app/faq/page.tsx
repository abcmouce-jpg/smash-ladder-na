import { DISCORD_SERVER_URL } from "@/lib/links";
import { getLang, type Lang } from "@/lib/i18n";
import { GEAR_RECOMMENDATIONS } from "@/lib/gear-links";
import { SCENE_LABEL, SITE_NAME } from "@/lib/site";

export const metadata = { title: `Q&A — ${SITE_NAME}` };

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
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export default async function FaqPage() {
  const lang = await getLang();
  const Faq = FAQ[lang];
  return <Faq />;
}

function FaqPageEn() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Q&amp;A</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        See also the{" "}
        <a href="/rules" className="underline">
          Rules page
        </a>{" "}
        for the actual match rules this refers back to.
      </p>

      <div className="mt-8 flex flex-col gap-8">
        <Category title="Ranked matches">
          <QA q="My opponent didn't respond after matching. What now?">
            Cancel the match and move on — the cancel button is there for exactly this. If it keeps happening with the
            same player, report them.
          </QA>
          <QA q="I only reported and my opponent never did. Does the match still count?">
            Yes. If your opponent never reports, your report is accepted automatically 24 hours after the match started,
            and they&apos;re charged a no-show. If neither of you reports within 24 hours, the match closes with no
            rating change for either player.
          </QA>
          <QA q="I reported the wrong winner by mistake.">
            Report again with the correct result before your opponent reports — the two of you just need to agree. If
            reports already disagree, the match goes to a mod as a dispute.
          </QA>
          <QA q="My opponent reported a different winner than what actually happened.">
            Don&apos;t just resubmit and hope — this puts the match in a disputed state where a mod steps in to resolve
            it based on both reports. If it was deliberate, file a conduct report too.
          </QA>
          <QA q="My rating didn't change after a confirmed match.">
            Rounding can occasionally produce a 0-point change at the extreme ends of a rating gap — that&apos;s
            expected, not a bug. If both reports clearly matched and the winner looks wrong on your profile, report the
            match as a dispute.
          </QA>
          <QA q="What do I need for a 'wired connection' badge?">
            A USB-C-to-Ethernet adapter if you play undocked, or just an Ethernet cable into the dock. See the{" "}
            <a href="/rules" className="underline">
              Rules page
            </a>{" "}
            for the full list of recommended gear:{" "}
            {GEAR_RECOMMENDATIONS.map((item, i) => (
              <span key={item.url}>
                {i > 0 && " · "}
                <a href={item.url} target="_blank" rel="noopener noreferrer sponsored" className="underline">
                  {item.label}
                </a>
              </span>
            ))}
            . As an Amazon Associate, we earn from qualifying purchases.
          </QA>
        </Category>

        <Category title="Practicing">
          <QA q="Does a practicing match affect my ladder rating?">
            No. Practicing results go entirely to a separate practice rating — your regular ladder rating and
            sets-played count don&apos;t move, whether you win or lose.
          </QA>
          <QA q="I didn't mean to check Practicing — can I turn it off mid-match?">
            No, it&apos;s locked in for that match once you&apos;re paired. Cancel the match if it&apos;s still early
            enough (see &quot;Canceling a match&quot; above), or ask your opponent to agree to a mutual cancel from the
            match screen, then requeue with the box unchecked.
          </QA>
          <QA q="Can I use my main character while practicing?">
            No — see the Rules page. Practicing takes your own rating off the table, so playing your main against
            someone who isn&apos;t practicing puts all the risk on them and none on you. This isn&apos;t blocked
            automatically; file a conduct report if you run into it.
          </QA>
        </Category>

        <Category title="Character reporting">
          <QA q="My character isn't showing on my profile.">
            It only shows once an opponent reports it after a match — there&apos;s no self-select. If you just finished
            a match, give it a moment; if it&apos;s been a while, your opponent may not have reported it.
          </QA>
          <QA q="Someone reported the wrong character for me.">
            One bad report won&apos;t meaningfully skew anything — the character leaderboard looks at reports in
            aggregate. If you think it&apos;s a deliberate pattern of bad-faith reporting, file a conduct report on that
            player.
          </QA>
        </Category>

        <Category title="Conduct, reports, and account status">
          <QA q="Someone was toxic to me outside of a match — Discord DMs, stream chat, etc.">
            The report system covers conduct connected to ranked matches on this site. For anything off-platform, block
            them and, if it&apos;s serious, report it to Discord directly.
          </QA>
          <QA q="I reported someone — will you tell me what happened to them?">
            No. We don&apos;t disclose moderation outcomes on individual reports, mainly so reporters aren&apos;t
            identifiable and targeted for retaliation. Filing a report is still the right move even without visible
            confirmation — a single report rarely results in action by itself, but a pattern does.
          </QA>
          <QA q="My account was suspended or banned. Why, and can I appeal?">
            We don&apos;t publish the specific reports behind a status change, for the same retaliation-prevention
            reason above. If you think it&apos;s a mistake, reach out to a mod or admin in the{" "}
            <a href={DISCORD_SERVER_URL} className="underline" target="_blank" rel="noreferrer">
              community Discord server
            </a>{" "}
            — appeals go through them, not through the report system.
          </QA>
          <QA q="What's the actual difference between suspended and banned?">
            Suspended (Level 1) still lets you play ranked — that&apos;s the core activity, and disputes already give
            bad results their own path to correction — but blocks posting on Friendlies and filing new reports, so a
            suspended player can&apos;t retaliate against whoever reported them. Banned (Level 2) blocks everything.
          </QA>
        </Category>

        <Category title="Account">
          <QA q="How do I delete my account?">
            From your profile page, under &quot;Danger zone.&quot; It scrubs your username, avatar, and email
            immediately. See the{" "}
            <a href="/privacy" className="underline">
              Privacy Policy
            </a>{" "}
            for exactly what&apos;s kept and why.
          </QA>
          <QA q="Can I undo an account deletion, or merge it into a new account?">
            Signing back in with the same Discord account resumes your original account — same rating and match history
            — rather than starting a fresh one, but your username, avatar, and email stay scrubbed until you change them
            yourself. There&apos;s no way to merge a deletion into a different, separate account.
          </QA>
          <QA q="Is matchmaking open worldwide?">
            Yes — anyone can join. Set your region and a match distance on the Lobby page; the defaults match you with
            same-or-nearby-region players, and you can widen that up to Worldwide if you&apos;d rather queue faster. See
            the Rules page for exactly how the distance setting works.
          </QA>
        </Category>

        <Category title="Seasons">
          <QA q="What happens to my rating when a season ends?">
            Standings get snapshotted, then rating and sets-played reset for everyone at the start of the next season —
            a clean slate rather than a partial regression, so every season starts on equal footing.
          </QA>
        </Category>

        <Category title="Community & moderation">
          <QA q="Is there a Discord server?">
            Yes —{" "}
            <a href={DISCORD_SERVER_URL} className="underline" target="_blank" rel="noreferrer">
              join here
            </a>
            . It&apos;s where to hang out, report site issues, or reach a mod/admin (e.g. for a ban appeal).
          </QA>
          <QA q="How is moderation staffed?">
            Around 5 mods/admins currently, selected on a volunteer basis. If you&apos;re interested in helping out,
            reach out in the Discord server above.
          </QA>
          <QA q="Is this affiliated with Japan's Smash Ladder / Smashmate?">
            No — this is an independent, separately-run project built for the {SCENE_LABEL.en} scene. It borrows its
            name as a hat-tip to Japan&apos;s long-running online matchmaking platform, but the two projects are not
            connected in any way.
          </QA>
          <QA q="Do you use AI to help build and run this site?">
            Yes. A lot of the code, bug fixes, and day-to-day maintenance (deploys, moderation tooling, this FAQ entry
            included) is done with AI assistance. We&apos;re not hiding that — if you&apos;re curious how something
            specific was built, ask in the Discord server above.
          </QA>
        </Category>
      </div>
    </main>
  );
}

function FaqPageEs() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Preguntas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Consulta también la{" "}
        <a href="/rules" className="underline">
          página de Reglas
        </a>{" "}
        para las reglas de partida reales a las que hace referencia esto.
      </p>

      <div className="mt-8 flex flex-col gap-8">
        <Category title="Partidas rankeadas">
          <QA q="Mi rival no respondió después de emparejarnos. ¿Qué hago?">
            Cancela la partida y sigue adelante — el botón de cancelar está justo para esto. Si sigue pasando con el
            mismo jugador, repórtalo.
          </QA>
          <QA q="Solo yo reporté y mi rival nunca lo hizo. ¿La partida sigue contando?">
            Sí. Si tu rival nunca reporta, tu reporte se acepta automáticamente 24 horas después de que empezó la
            partida, y se le marca un no-show. Si ninguno de los dos reporta dentro de 24 horas, la partida se cierra
            sin cambio de clasificación para ninguno.
          </QA>
          <QA q="Reporté al ganador equivocado por error.">
            Reporta de nuevo con el resultado correcto antes de que tu rival reporte — solo necesitan ponerse de
            acuerdo. Si los reportes ya no coinciden, la partida pasa a un mod como disputa.
          </QA>
          <QA q="Mi rival reportó un ganador distinto a lo que realmente pasó.">
            No vuelvas a enviar tu reporte esperando que se arregle solo — esto pone la partida en estado de disputa,
            donde un mod interviene para resolverla según ambos reportes. Si fue deliberado, presenta también un reporte
            de conducta.
          </QA>
          <QA q="Mi clasificación no cambió después de una partida confirmada.">
            El redondeo puede ocasionalmente producir un cambio de 0 puntos en los extremos de una diferencia de
            clasificación grande — eso es esperado, no un bug. Si ambos reportes coincidían claramente y el ganador se
            ve mal en tu perfil, reporta la partida como disputa.
          </QA>
          <QA q="¿Qué necesito para la insignia de 'conexión por cable'?">
            Un adaptador USB-C a Ethernet si juegas sin el dock, o simplemente un cable Ethernet al dock. Ve la{" "}
            <a href="/rules" className="underline">
              página de Reglas
            </a>{" "}
            para la lista completa de equipo recomendado:{" "}
            {GEAR_RECOMMENDATIONS.map((item, i) => (
              <span key={item.url}>
                {i > 0 && " · "}
                <a href={item.url} target="_blank" rel="noopener noreferrer sponsored" className="underline">
                  {item.label}
                </a>
              </span>
            ))}
            . Como Afiliado de Amazon, ganamos por compras que califican.
          </QA>
        </Category>

        <Category title="Modo práctica">
          <QA q="¿Una partida en modo práctica afecta mi clasificación del ladder?">
            No. Los resultados en modo práctica van completamente a una clasificación de práctica aparte — tu
            clasificación normal del ladder y tu conteo de partidas jugadas no se mueven, ganes o pierdas.
          </QA>
          <QA q="No quería marcar Practicando por accidente — ¿puedo desactivarlo a mitad de partida?">
            No, queda fijado para esa partida en cuanto te emparejan. Cancela la partida si aún es lo bastante temprano
            (ver &quot;Cancelar una partida&quot; arriba), o pídele a tu rival que acepte una cancelación mutua desde la
            pantalla de partida, y luego vuelve a entrar a la cola con la casilla desmarcada.
          </QA>
        </Category>

        <Category title="Reportar personaje">
          <QA q="Mi personaje no aparece en mi perfil.">
            Solo aparece una vez que un rival lo reporta después de una partida — no hay autoselección. Si acabas de
            terminar una partida, dale un momento; si ya pasó tiempo, puede que tu rival no lo haya reportado.
          </QA>
          <QA q="Alguien reportó el personaje equivocado para mí.">
            Un solo reporte malo no distorsiona nada de forma significativa — la tabla de posiciones por personaje mira
            los reportes en conjunto. Si crees que es un patrón deliberado de reportes de mala fe, presenta un reporte
            de conducta sobre ese jugador.
          </QA>
        </Category>

        <Category title="Conducta, reportes, y estado de la cuenta">
          <QA q="Alguien fue tóxico conmigo fuera de una partida — DMs de Discord, chat de stream, etc.">
            El sistema de reportes cubre conducta relacionada con partidas rankeadas en este sitio. Para cualquier cosa
            fuera de la plataforma, bloquéalo y, si es grave, repórtalo directamente a Discord.
          </QA>
          <QA q="Reporté a alguien — ¿me dirán qué le pasó?">
            No. No revelamos los resultados de moderación de reportes individuales, principalmente para que quien
            reporta no sea identificable y blanco de represalias. Presentar un reporte sigue siendo lo correcto aunque
            no veas confirmación — un solo reporte rara vez resulta en una acción por sí solo, pero un patrón sí.
          </QA>
          <QA q="Mi cuenta fue suspendida o baneada. ¿Por qué, y puedo apelar?">
            No publicamos los reportes específicos detrás de un cambio de estado, por la misma razón de prevención de
            represalias de arriba. Si crees que es un error, contacta a un mod o admin en el{" "}
            <a href={DISCORD_SERVER_URL} className="underline" target="_blank" rel="noreferrer">
              servidor de Discord de la comunidad
            </a>{" "}
            — las apelaciones pasan por ellos, no por el sistema de reportes.
          </QA>
          <QA q="¿Cuál es la diferencia real entre suspendido y baneado?">
            Suspendido (Nivel 1) todavía te deja jugar rankeado — esa es la actividad principal, y las disputas ya le
            dan a los malos resultados su propio camino de corrección — pero bloquea publicar en Amistosos y presentar
            nuevos reportes, para que un jugador suspendido no pueda tomar represalias contra quien lo reportó. Baneado
            (Nivel 2) bloquea todo.
          </QA>
        </Category>

        <Category title="Cuenta">
          <QA q="¿Cómo elimino mi cuenta?">
            Desde tu página de perfil, bajo &quot;Zona de peligro&quot;. Borra tu nombre de usuario, avatar y correo
            electrónico de inmediato. Consulta la{" "}
            <a href="/privacy" className="underline">
              Política de privacidad
            </a>{" "}
            para ver exactamente qué se conserva y por qué.
          </QA>
          <QA q="¿Puedo deshacer la eliminación de una cuenta, o fusionarla con una nueva?">
            Volver a iniciar sesión con la misma cuenta de Discord retoma tu cuenta original — misma clasificación e
            historial de partidas — en vez de empezar una nueva, pero tu nombre de usuario, avatar y correo siguen
            borrados hasta que los cambies tú mismo. No hay forma de fusionar una eliminación con una cuenta distinta.
          </QA>
          <QA q="¿El emparejamiento está abierto a nivel mundial?">
            Sí — cualquiera puede unirse. Define tu región y una distancia de partida en la página de Sala; los valores
            por defecto te emparejan con jugadores de la misma región o cercanos, y puedes ampliarlo hasta Mundial si
            prefieres entrar a la cola más rápido. Consulta la página de Reglas para ver exactamente cómo funciona el
            ajuste de distancia.
          </QA>
        </Category>

        <Category title="Temporadas">
          <QA q="¿Qué pasa con mi clasificación cuando termina una temporada?">
            Se toma una foto de la tabla de posiciones, y luego la clasificación y las partidas jugadas se reinician
            para todos al empezar la siguiente temporada — un borrón y cuenta nueva en vez de una regresión parcial,
            para que cada temporada empiece en igualdad de condiciones.
          </QA>
        </Category>

        <Category title="Comunidad y moderación">
          <QA q="¿Hay un servidor de Discord?">
            Sí —{" "}
            <a href={DISCORD_SERVER_URL} className="underline" target="_blank" rel="noreferrer">
              únete aquí
            </a>
            . Es el lugar para socializar, reportar problemas del sitio, o contactar a un mod/admin (por ejemplo, para
            apelar un ban).
          </QA>
          <QA q="¿Cómo se forma el equipo de moderación?">
            Actualmente unos 5 mods/admins, elegidos de forma voluntaria. Si te interesa ayudar, contacta en el servidor
            de Discord de arriba.
          </QA>
          <QA q="¿Esto está afiliado con Smash Ladder / Smashmate de Japón?">
            No — este es un proyecto independiente, gestionado por separado, construido para la escena {SCENE_LABEL.es}.
            Toma su nombre como un guiño a la plataforma japonesa de matchmaking en línea, pero los dos proyectos no
            están conectados de ninguna manera.
          </QA>
          <QA q="¿Usan IA para construir y mantener este sitio?">
            Sí. Gran parte del código, corrección de bugs, y mantenimiento del día a día (despliegues, herramientas de
            moderación, esta misma entrada del FAQ incluida) se hace con ayuda de IA. No lo ocultamos — si tienes
            curiosidad de cómo se construyó algo en específico, pregunta en el servidor de Discord de arriba.
          </QA>
        </Category>
      </div>
    </main>
  );
}

function FaqPageJa() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Q&amp;A</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        ここで触れている試合ルールの詳細は{" "}
        <a href="/rules" className="underline">
          ルールページ
        </a>{" "}
        もあわせてご覧ください。
      </p>

      <div className="mt-8 flex flex-col gap-8">
        <Category title="ランクマッチ">
          <QA q="マッチしたのに相手から反応がありません。どうすればいいですか？">
            試合をキャンセルして次に進んでください。キャンセルボタンはまさにそのためのものです。同じプレイヤーで何度も起きる場合は通報してください。
          </QA>
          <QA q="自分だけ結果を報告して、相手が報告してくれません。試合は有効になりますか？">
            はい。相手が報告しないままの場合、試合開始から 24
            時間後にあなたの報告が自動で採用され、相手には無断不参加が記録されます。24
            時間以内にどちらも報告しなかった場合、試合はどちらのレートも変わらないまま終了します。
          </QA>
          <QA q="間違えて逆の勝者を報告してしまいました。">
            相手が報告する前に、正しい結果でもう一度報告してください。お互いの報告が一致すれば問題ありません。すでに報告が食い違っている場合は、異議申立としてモデレーターの確認に回ります。
          </QA>
          <QA q="相手が実際とは違う勝者を報告しました。">
            報告をやり直して様子を見るのではなく、そのままにしておいてください。試合は異議申立の状態になり、双方の報告をもとにモデレーターが判断します。故意だと思われる場合は、あわせて通報もしてください。
          </QA>
          <QA q="試合が確定したのにレートが変わりません。">
            レート差が極端に大きい場合、端数処理で変動が 0
            になることがあります。これは仕様で、不具合ではありません。双方の報告が明らかに一致していて、プロフィール上の勝者がおかしい場合は、異議申立をしてください。
          </QA>
          <QA q="「有線接続」バッジには何が必要ですか？">
            携帯モードなら USB-C 有線 LAN アダプター、TV モードならドックに LAN
            ケーブルを挿すだけです。おすすめ機材の一覧は{" "}
            <a href="/rules" className="underline">
              ルールページ
            </a>{" "}
            にあります：{" "}
            {GEAR_RECOMMENDATIONS.map((item, i) => (
              <span key={item.url}>
                {i > 0 && " · "}
                <a href={item.url} target="_blank" rel="noopener noreferrer sponsored" className="underline">
                  {item.label}
                </a>
              </span>
            ))}
            。Amazon アソシエイトとして、当サイトは適格販売により収入を得ています。
          </QA>
        </Category>

        <Category title="練習モード">
          <QA q="練習モードの試合はラダーのレートに影響しますか？">
            いいえ。練習モードの結果はすべて別枠の練習用レートに反映されます。勝っても負けても、通常のラダーのレートとセット数は変わりません。
          </QA>
          <QA q="うっかり練習モードにチェックを入れてしまいました。試合中にオフにできますか？">
            いいえ。マッチした時点でその試合については固定されます。まだ間に合うなら試合をキャンセルするか、試合画面から相手に双方合意でのキャンセルを提案して、チェックを外してから待ち直してください。
          </QA>
          <QA q="練習モード中にメインキャラを使ってもいいですか？">
            いいえ（ルールページ参照）。練習モードでは自分のレートが懸からなくなるため、練習モードでない相手にメインキャラで挑むと、リスクを相手だけに負わせることになります。システムでは防いでいないので、遭遇した場合は通報してください。
          </QA>
        </Category>

        <Category title="キャラクターの報告">
          <QA q="プロフィールに自分のキャラクターが表示されません。">
            キャラクターは試合後に対戦相手が報告して初めて表示されます。自分で選ぶ仕組みはありません。試合が終わったばかりなら少し待ってください。しばらく経っても表示されない場合は、相手が報告しなかった可能性があります。
          </QA>
          <QA q="相手に間違ったキャラクターを報告されました。">
            キャラクターランキングは報告を集計して見ているので、1
            件の誤報告で大きくずれることはありません。悪意のある誤報告が繰り返されていると思う場合は、そのプレイヤーを通報してください。
          </QA>
        </Category>

        <Category title="マナー・通報・アカウントの状態">
          <QA q="試合以外の場所（Discord の DM や配信のチャットなど）で嫌がらせを受けました。">
            通報システムが対象とするのは、このサイトのランクマッチに関わる行為です。サイト外の出来事については相手をブロックし、深刻な場合は
            Discord に直接報告してください。
          </QA>
          <QA q="通報した相手がどうなったか教えてもらえますか？">
            いいえ。個々の通報に対する処分内容は公開していません。主に、通報者が特定されて報復を受けないようにするためです。結果が見えなくても通報は有効です。1
            件の通報だけで処分に至ることはまれですが、同様の通報が重なれば対応につながります。
          </QA>
          <QA q="アカウントが利用停止・BAN されました。理由は？異議は申し立てられますか？">
            上と同じく報復防止のため、状態変更の根拠となった通報の内容は公開していません。間違いだと思う場合は{" "}
            <a href={DISCORD_SERVER_URL} className="underline" target="_blank" rel="noreferrer">
              コミュニティの Discord サーバー
            </a>{" "}
            でモデレーターか管理者に連絡してください。異議申し立ては通報システムではなく、そちらで受け付けています。
          </QA>
          <QA q="利用停止と BAN の違いは何ですか？">
            利用停止（レベル
            1）でもランクマッチは遊べます。ランクマッチはサイトの中心で、結果のトラブルには異議申立という別の解決手段があるためです。ただし、フリー対戦への投稿と新たな通報はできなくなり、通報した相手に報復することはできません。BAN（レベル
            2）ではすべての機能が使えなくなります。
          </QA>
        </Category>

        <Category title="アカウント">
          <QA q="アカウントを削除するには？">
            プロフィールページの「危険な操作」から削除できます。ユーザー名・アバター・メールアドレスは即座に消去されます。何が残り、なぜ残るのかは{" "}
            <a href="/privacy" className="underline">
              プライバシーポリシー
            </a>{" "}
            をご覧ください。
          </QA>
          <QA q="アカウントの削除を取り消したり、新しいアカウントに統合したりできますか？">
            同じ Discord
            アカウントでもう一度ログインすると、新規ではなく元のアカウント（レートや対戦履歴もそのまま）が再開されます。ただし、ユーザー名・アバター・メールアドレスは自分で設定し直すまで消去されたままです。削除したアカウントを別のアカウントに統合する方法はありません。
          </QA>
          <QA q="マッチングは世界中に開かれていますか？">
            はい、誰でも参加できます。ロビーのページで地域とマッチング距離を設定してください。初期設定では同じ地域か近い地域のプレイヤーとマッチし、早くマッチしたい場合は「全世界」まで広げられます。距離設定の詳しい仕組みはルールページをご覧ください。
          </QA>
        </Category>

        <Category title="シーズン">
          <QA q="シーズンが終わるとレートはどうなりますか？">
            順位が記録されたあと、次のシーズン開始時に全員のレートとセット数がリセットされます。一部だけ戻すのではなく完全にリセットするので、どのシーズンも全員が同じ条件でスタートします。
          </QA>
        </Category>

        <Category title="コミュニティとモデレーション">
          <QA q="Discord サーバーはありますか？">
            はい。
            <a href={DISCORD_SERVER_URL} className="underline" target="_blank" rel="noreferrer">
              こちらから参加
            </a>
            できます。交流、サイトの不具合報告、モデレーターや管理者への連絡（BAN
            への異議申し立てなど）はこちらでどうぞ。
          </QA>
          <QA q="モデレーションは誰がやっていますか？">
            現在、ボランティアで選ばれた 5 人ほどのモデレーター・管理者が担当しています。手伝ってみたい方は、上の
            Discord サーバーで声をかけてください。
          </QA>
          <QA q="日本のスマメイトと関係はありますか？">
            いいえ。これは{SCENE_LABEL.ja}
            シーンのために作られた、独立した別運営のプロジェクトです。名前は日本で長く続いてきたオンライン対戦プラットフォームへの敬意を込めて借りていますが、両者に一切のつながりはありません。
          </QA>
          <QA q="サイトの開発や運営に AI を使っていますか？">
            はい。コードの多く、不具合の修正、日々の保守作業（デプロイ、モデレーション用ツール、この Q&amp;A
            の項目も含む）は AI
            の支援を受けて行っています。隠すつもりはありません。特定の機能がどう作られたか気になる方は、上の Discord
            サーバーで聞いてみてください。
          </QA>
        </Category>
      </div>
    </main>
  );
}

const FAQ: Record<Lang, () => React.JSX.Element> = {
  en: FaqPageEn,
  es: FaqPageEs,
  ja: FaqPageJa,
};
