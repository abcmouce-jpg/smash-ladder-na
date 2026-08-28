import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { SEASON_PRIZE_POOL_USD, PRIZE_SPLIT_PERCENT, approxMxn } from "@/lib/prizes";
import { PRE_SEASON_DURATION_MONTHS, PRE_SEASON_EXPECTED_END_AT } from "@/lib/seasons";
import { getLang } from "@/lib/i18n";

export const metadata = { title: "Rules — Smash Ladder NA" };

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
  if (lang === "es") return <RulesPageEs />;
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Rules</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Covers ranked play. Free battle and start.gg tournaments are separate — see the notes at the bottom.
      </p>

      <div className="mt-8 flex flex-col gap-6 text-sm text-muted-foreground">
        <Section title="Format">
          <p>All ranked matches are best-of-5. Stage hazards off. Standard stock/time settings.</p>
        </Section>

        <Section title="Season prize pool">
          <p>
            The top 5 finishers on the leaderboard when the season ends split a ${SEASON_PRIZE_POOL_USD} USD prize pool:
            1st gets {PRIZE_SPLIT_PERCENT[0]}%, 2nd {PRIZE_SPLIT_PERCENT[1]}%, 3rd {PRIZE_SPLIT_PERCENT[2]}%, 4th{" "}
            {PRIZE_SPLIT_PERCENT[3]}%, and 5th {PRIZE_SPLIT_PERCENT[4]}%. You need {LEADERBOARD_MIN_GAMES}+ sets played
            to appear on the leaderboard at all.
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
            account for 24 hours — ranked play still works while suspended, but free battle and filing new conduct
            reports don&apos;t. Surrendering doesn&apos;t count toward this — it already costs rating, so there&apos;s
            no separate penalty on top.
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
            goes quiet mid-set instead of surrendering yourself, you generally don&apos;t need to do anything: an
            unresponsive opponent auto-forfeits their turn after a few minutes (character pick or stage strike,
            whichever they&apos;re stuck on) and the set continues without erasing anything already decided. If
            you&apos;d rather not wait, or you and your opponent both want to call the whole set off instead, either of
            you can request a mutual cancel from the match screen; once the other side agrees, it cancels immediately
            with no rating impact for either player, no matter how far the set got.
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
            report at all). Suspension blocks free battle and filing new reports (so a suspended player can&apos;t
            retaliate) but ranked play stays open, and can be timed (auto-lifts) or indefinite. A ban blocks everything.
            See{" "}
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
            Joining the ranked lobby queues you for up to 10 minutes before the entry expires. You can join at most 5
            times per minute.
          </p>
        </Section>

        <Section title="Free battle and tournaments">
          <p>
            Free battle posts are unrated, first-come-claimed, and expire after 24 hours — good for practice or
            friendlies without touching your rating. Community tournaments are run on start.gg; sign-ups happen here,
            but bracket rules and disputes for a given tournament are set by that tournament&apos;s host.
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
        Cubre el juego rankeado. Free battle y los torneos de start.gg son aparte — ver las notas al final.
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
            Los 5 primeros en la tabla de posiciones cuando termina la temporada se reparten una bolsa de $
            {SEASON_PRIZE_POOL_USD} USD (≈ ${approxMxn(SEASON_PRIZE_POOL_USD).toLocaleString("es-MX")} MXN, solo de
            referencia — el pago siempre se hace en USD por PayPal): 1° recibe {PRIZE_SPLIT_PERCENT[0]}%, 2°{" "}
            {PRIZE_SPLIT_PERCENT[1]}%, 3° {PRIZE_SPLIT_PERCENT[2]}%, 4° {PRIZE_SPLIT_PERCENT[3]}%, y 5°{" "}
            {PRIZE_SPLIT_PERCENT[4]}%. Necesitas {LEADERBOARD_MIN_GAMES}+ partidas jugadas para aparecer en la tabla de
            posiciones.
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
            pero free battle y presentar nuevos reportes de conducta no. Rendirse no cuenta para esto — ya cuesta
            clasificación, así que no hay una penalización aparte encima.
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
            partida continúa sin borrar nada ya decidido. Si prefieres no esperar, o tú y tu rival quieren cancelar toda
            la partida de mutuo acuerdo, cualquiera de los dos puede pedir una cancelación mutua desde la pantalla de
            partida; en cuanto el otro lado acepta, se cancela de inmediato sin afectar la clasificación de ninguno, sin
            importar qué tan avanzada estuviera la partida.
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
            también puede actuar directamente sin ningún reporte). La suspensión bloquea free battle y presentar nuevos
            reportes (para que un jugador suspendido no pueda tomar represalias) pero el juego rankeado sigue
            disponible, y puede ser temporal (se levanta sola) o indefinida. Un ban bloquea todo. Consulta{" "}
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
            Entrar a la sala rankeada te pone en cola hasta por 10 minutos antes de que la entrada expire. Puedes entrar
            como máximo 5 veces por minuto.
          </p>
        </Section>

        <Section title="Free battle y torneos">
          <p>
            Las publicaciones de free battle no afectan la clasificación, se reclaman por orden de llegada, y expiran
            después de 24 horas — buenas para practicar o jugar amistosos sin tocar tu clasificación. Los torneos de la
            comunidad se organizan en start.gg; las inscripciones ocurren aquí, pero las reglas de bracket y disputas de
            un torneo específico las define quien organiza ese torneo.
          </p>
        </Section>
      </div>
    </main>
  );
}
