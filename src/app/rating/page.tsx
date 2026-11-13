import { getLang } from "@/lib/i18n";
import { SITE_NAME, instanceText } from "@/lib/site";
import { MAX_RATING_DELTA, MIN_RATING_DELTA } from "@/lib/matches";
import { PROVISIONAL_GAMES_THRESHOLD, RANK_TIERS } from "@/lib/rank-tier";

export const metadata = {
  title: `${instanceText({ en: "How the rating works", es: "Cómo funciona la clasificación" })} — ${SITE_NAME}`,
  description: instanceText({
    en: "What the number on your profile means, why it moves the amount it does, and what does and does not count toward it.",
    es: "Qué significa el número de tu perfil, por qué se mueve lo que se mueve, y qué cuenta y qué no.",
  }),
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

// The tier table is rendered from RANK_TIERS rather than written out, so a
// tier whose floor moves cannot leave a stale number on a public page.
function TierTable({ lowest }: { lowest: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <tbody>
          {RANK_TIERS.map((t) => (
            <tr key={t.name} className="border-b border-border last:border-0">
              <td className="px-3 py-2 font-medium text-foreground">{t.name}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                {Number.isFinite(t.minRating) ? `${t.minRating}+` : lowest}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function RatingPage() {
  const lang = await getLang();
  if (lang === "es") return <RatingPageEs />;
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">How the rating works</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        What the number on your profile means, why it moves the amount it does, and what counts toward it.
      </p>

      <div className="mt-8 flex flex-col gap-8 text-sm text-muted-foreground">
        <Section title="What the number is">
          <p>
            Your rating is an estimate of how strong you are, not a score you accumulate. It is not points for showing
            up: playing more sets does not push it up on its own, and sitting out does not pull it down. Everyone starts
            at 1500, and from there the only thing that moves it is the result of a rated set.
          </p>
          <p>
            The ladder runs Glicko-2. The short version is that it does the same job as the Elo rating most people have
            met before — predict who should win, then correct itself when it was wrong — but it also keeps track of how
            sure it is about each player, which is what the next two sections are about.
          </p>
        </Section>

        <Section title="Why it moves by different amounts">
          <p>
            Before a set, the ladder works out how likely each side is to win from the two ratings. The result is then
            compared against that expectation, and the size of the correction is the size of the surprise.
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Beating someone rated far above you is a large surprise, so you gain a lot and they lose a lot.</li>
            <li>Beating someone far below you is what was supposed to happen, so almost nothing moves.</li>
            <li>An even matchup sits in between, and both sides move a moderate amount.</li>
          </ul>
          <p>
            Two limits sit on top of that. A single set can never move a rating by more than {MAX_RATING_DELTA} points,
            however lopsided the upset — one result should not undo a season. And it can never move it by less than{" "}
            {MIN_RATING_DELTA}: every confirmed set moves the winner up and the loser down, so a set you actually played
            never reads as nothing.
          </p>
        </Section>

        <Section title="Why your first sets swing so hard">
          <p>
            Alongside your rating, the ladder keeps a second number: how confident it is that the rating is right. A new
            account starts with that confidence very low, because 1500 is a guess rather than a measurement.
          </p>
          <p>
            While it is low, results move your rating in large steps — that is the ladder finding your level quickly
            instead of making you grind toward it. As you play, the estimate tightens and the steps get smaller. Two
            players can therefore come out of the same set with very different changes: the newer account moves more,
            because there was more to learn from it.
          </p>
          <p>
            Time loosens it again. After a long break the ladder becomes less sure you are still where you were, so a
            comeback set counts for more than it would have if you had never stopped.
          </p>
        </Section>

        <Section title="Provisional: the first few sets">
          <p>
            Your rating is hidden, from you and from everyone else, until you have played {PROVISIONAL_GAMES_THRESHOLD}{" "}
            rated sets. A rating built on one or two results is mostly noise, and publishing it would invite people to
            read meaning into a number that does not have any yet. You are still matched and still rated during that
            time — only the display waits.
          </p>
        </Section>

        <Section title="Ranks">
          <p>Ranks are bands of rating, so you move between them by playing rather than by claiming one.</p>
          <TierTable lowest="below 1400" />
          <p>
            A rank is only shown once you are past provisional, for the same reason the number is. The band the starting
            rating sits in is where most players settle.
          </p>
        </Section>

        <Section title="You have more than one rating">
          <p>
            The ladder keeps three separate ratings, and a set only ever moves one of them. They never mix: a bad run in
            practice cannot touch the number on your profile.
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <span className="font-medium text-foreground">Ranked</span> — the main one, the one on the leaderboard.
            </li>
            <li>
              <span className="font-medium text-foreground">Practice</span> — for sets you queue with practice mode on,
              for trying a character you have no business playing yet.
            </li>
            <li>
              <span className="font-medium text-foreground">Randitto</span> — its own ladder, because being handed a
              random fighter measures something different from playing your main.
            </li>
          </ul>
        </Section>

        <Section title="What does not count">
          <p>
            Friendlies are not rated at all. Neither are sets that end without a confirmed result: if a match is
            cancelled, or expires because nobody reported it, both ratings are left exactly where they were. Sets played
            at start.gg tournaments are not rated here either — this ladder only rates what happens on it.
          </p>
        </Section>

        <Section title="Seasons">
          <p>
            A season is a rating period. When one ends, everyone is reset for the next, so a season is a fresh field
            rather than a permanent record — and a rating earned in one season is not comparable to one from another.
            Season 1 runs on Glicko-2; the preseason before it ran on plain Elo, which is why older numbers moved
            differently.
          </p>
        </Section>

        <p className="text-xs">
          See the{" "}
          <a href="/rules" className="underline">
            Rules
          </a>{" "}
          for how a set is played and reported, and the{" "}
          <a href="/faq" className="underline">
            Q&amp;A
          </a>{" "}
          for what to do when one goes wrong.
        </p>
      </div>
    </main>
  );
}

function RatingPageEs() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Cómo funciona la clasificación</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Qué significa el número de tu perfil, por qué se mueve lo que se mueve, y qué cuenta para él.
      </p>

      <div className="mt-8 flex flex-col gap-8 text-sm text-muted-foreground">
        <Section title="Qué es el número">
          <p>
            Tu clasificación es una estimación de qué tan fuerte eres, no un puntaje que acumulas. No son puntos por
            presentarte: jugar más sets no la sube por sí solo, y no jugar no la baja. Todos empiezan en 1500, y a
            partir de ahí lo único que la mueve es el resultado de un set clasificatorio.
          </p>
          <p>
            El ladder usa Glicko-2. En corto, hace lo mismo que el Elo que la mayoría ya conoce — predecir quién debería
            ganar y corregirse cuando se equivoca — pero además lleva cuenta de qué tan seguro está de cada jugador, que
            es de lo que tratan las dos secciones siguientes.
          </p>
        </Section>

        <Section title="Por qué se mueve distinto cada vez">
          <p>
            Antes de un set, el ladder calcula qué tan probable es que gane cada lado según las dos clasificaciones.
            Luego compara el resultado con esa expectativa, y el tamaño de la corrección es el tamaño de la sorpresa.
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Ganarle a alguien muy por encima de ti es una gran sorpresa: subes mucho y esa persona baja mucho.</li>
            <li>Ganarle a alguien muy por debajo es lo que se esperaba, así que casi nada se mueve.</li>
            <li>Un emparejamiento parejo queda en medio, y ambos lados se mueven una cantidad moderada.</li>
          </ul>
          <p>
            Encima de eso hay dos límites. Un solo set nunca mueve una clasificación más de {MAX_RATING_DELTA} puntos,
            por grande que sea la sorpresa — un resultado no debería deshacer una temporada. Y nunca la mueve menos de{" "}
            {MIN_RATING_DELTA}: cada set confirmado sube al ganador y baja al perdedor, así que un set que de verdad
            jugaste nunca se lee como nada.
          </p>
        </Section>

        <Section title="Por qué tus primeros sets mueven tanto">
          <p>
            Junto a tu clasificación, el ladder guarda un segundo número: qué tan seguro está de que la clasificación es
            correcta. Una cuenta nueva empieza con esa seguridad muy baja, porque 1500 es una suposición y no una
            medición.
          </p>
          <p>
            Mientras es baja, los resultados mueven tu clasificación a pasos grandes — así el ladder encuentra tu nivel
            rápido en vez de hacerte escalar. Conforme juegas, la estimación se afina y los pasos se achican. Por eso
            dos jugadores pueden salir del mismo set con cambios muy distintos: la cuenta más nueva se mueve más, porque
            había más que aprender de ella.
          </p>
          <p>
            El tiempo la vuelve a aflojar. Tras una pausa larga el ladder está menos seguro de que sigas donde estabas,
            así que un set de regreso cuenta más de lo que habría contado sin la pausa.
          </p>
        </Section>

        <Section title="Provisional: los primeros sets">
          <p>
            Tu clasificación está oculta, para ti y para los demás, hasta que juegues {PROVISIONAL_GAMES_THRESHOLD} sets
            clasificatorios. Una clasificación construida sobre uno o dos resultados es casi solo ruido, y publicarla
            invitaría a leer significado en un número que todavía no lo tiene. Durante ese tiempo sigues emparejándote y
            sigues siendo clasificado — solo espera lo que se muestra.
          </p>
        </Section>

        <Section title="Rangos">
          <p>Los rangos son bandas de clasificación, así que se cambia de banda jugando y no reclamándola.</p>
          <TierTable lowest="menos de 1400" />
          <p>
            El rango solo se muestra cuando pasas provisional, por la misma razón que el número. La banda donde cae la
            clasificación inicial es donde termina la mayoría.
          </p>
        </Section>

        <Section title="Tienes más de una clasificación">
          <p>
            El ladder guarda tres clasificaciones separadas, y un set solo mueve una de ellas. Nunca se mezclan: una
            mala racha en práctica no puede tocar el número de tu perfil.
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <span className="font-medium text-foreground">Clasificatoria</span> — la principal, la de la tabla de
              posiciones.
            </li>
            <li>
              <span className="font-medium text-foreground">Práctica</span> — para sets donde entras con el modo
              práctica activado, para probar un personaje que todavía no deberías estar jugando.
            </li>
            <li>
              <span className="font-medium text-foreground">Randitto</span> — su propio ladder, porque que te asignen un
              personaje al azar mide algo distinto a jugar tu main.
            </li>
          </ul>
        </Section>

        <Section title="Qué no cuenta">
          <p>
            Los amistosos no se clasifican. Tampoco los sets que terminan sin resultado confirmado: si una partida se
            cancela, o expira porque nadie reportó, ambas clasificaciones se quedan exactamente donde estaban. Los sets
            jugados en torneos de start.gg tampoco cuentan aquí — este ladder solo clasifica lo que pasa en él.
          </p>
        </Section>

        <Section title="Temporadas">
          <p>
            Una temporada es un periodo de clasificación. Al terminar una, todos se reinician para la siguiente, así que
            una temporada es un campo nuevo y no un registro permanente — y una clasificación de una temporada no es
            comparable con la de otra. La Temporada 1 corre sobre Glicko-2; la pretemporada anterior corrió sobre Elo
            simple, y por eso los números viejos se movían distinto.
          </p>
        </Section>

        <p className="text-xs">
          Ve las{" "}
          <a href="/rules" className="underline">
            Reglas
          </a>{" "}
          para cómo se juega y se reporta un set, y las{" "}
          <a href="/faq" className="underline">
            Preguntas
          </a>{" "}
          para qué hacer cuando algo sale mal.
        </p>
      </div>
    </main>
  );
}
