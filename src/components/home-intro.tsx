import Link from "next/link";
import type { Lang } from "@/lib/lang";
import { PROVISIONAL_GAMES_THRESHOLD } from "@/lib/rank-tier";
import { SITE_NAME } from "@/lib/site";

// Plain-language explainer at the foot of the home page. Everything else on
// the page is live data, which tells a first-time visitor (and a crawler or
// ad reviewer) nothing about what the site is for or how to use it.
const linkClass = "font-medium text-foreground underline underline-offset-2";

export function HomeIntro({ lang }: { lang: Lang }) {
  if (lang === "es") {
    return (
      <section className="mt-12 space-y-3 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">¿Qué es {SITE_NAME}?</h2>
        <p>
          {SITE_NAME} es una liga clasificatoria en línea, hecha por la comunidad, para jugadores de Super Smash Bros.
          Ultimate en Norteamérica. Es como las partidas clasificatorias que el juego no tiene: entras a la cola, el
          sitio te empareja con un rival de nivel parecido, juegan una serie en una arena del juego y los dos reportan
          el resultado. Cada serie confirmada mueve la clasificación de ambos.
        </p>
        <h3 className="font-medium text-foreground">Cómo funciona</h3>
        <p>
          Inicia sesión con Discord y entra a la Sala. Cuando aparece un rival, uno crea una arena y comparte el código.
          Antes de cada partida eligen personajes y descartan escenarios según las{" "}
          <Link href="/rules" className={linkClass}>
            reglas
          </Link>
          ; al terminar, cada jugador reporta quién ganó. Si los reportes no coinciden, un moderador revisa la serie.
        </p>
        <p>
          La clasificación usa Glicko-2, un sistema parecido al Elo que también mide qué tan seguro está de tu nivel. Tu
          número aparece después de {PROVISIONAL_GAMES_THRESHOLD} series, y con él un rango de Trainee a Legend. La
          página{" "}
          <Link href="/rating" className={linkClass}>
            cómo funciona la clasificación
          </Link>{" "}
          lo explica a detalle. La liga corre por temporadas, y la{" "}
          <Link href="/leaderboard" className={linkClass}>
            tabla de posiciones
          </Link>{" "}
          muestra a los mejores de la temporada actual.
        </p>
        <p>
          Además de la liga hay Amistosos, un tablón para encontrar partidas casuales, y estadísticas públicas por
          personaje y por jugador. ¿Dudas? Revisa las{" "}
          <Link href="/faq" className={linkClass}>
            preguntas frecuentes
          </Link>
          . {SITE_NAME} es un proyecto de fans y no está afiliado a Nintendo.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-12 space-y-3 text-sm leading-relaxed text-muted-foreground">
      <h2 className="text-base font-semibold text-foreground">What is {SITE_NAME}?</h2>
      <p>
        {SITE_NAME} is a community-run online ranked ladder for Super Smash Bros. Ultimate players in North America.
        Think of it as the ranked mode the game never had: you join the queue, the site pairs you with an opponent near
        your skill level, you play a set in an in-game arena, and both of you report the result. Every confirmed set
        moves both players&apos; ratings.
      </p>
      <h3 className="font-medium text-foreground">How it works</h3>
      <p>
        Sign in with Discord and open the Lobby. Once you&apos;re paired, one player hosts an arena and shares the room
        code. Before each game you pick characters and strike stages following the{" "}
        <Link href="/rules" className={linkClass}>
          ruleset
        </Link>
        ; afterwards each player reports who won. If the two reports disagree, a moderator reviews the set.
      </p>
      <p>
        Ratings use Glicko-2, an Elo-style system that also tracks how sure it is about your level. Your number shows up
        after {PROVISIONAL_GAMES_THRESHOLD} sets, along with a rank from Trainee up to Legend. The{" "}
        <Link href="/rating" className={linkClass}>
          how the rating works
        </Link>{" "}
        page explains it in full. The ladder runs in seasons, and the{" "}
        <Link href="/leaderboard" className={linkClass}>
          leaderboard
        </Link>{" "}
        shows who&apos;s on top of the current one.
      </p>
      <p>
        Beyond ranked there&apos;s Friendlies, a board for finding casual games, plus public stats by character and by
        player. Questions? The{" "}
        <Link href="/faq" className={linkClass}>
          FAQ
        </Link>{" "}
        covers the common ones. {SITE_NAME} is a fan project and isn&apos;t affiliated with Nintendo.
      </p>
    </section>
  );
}
