import { getLang } from "@/lib/i18n";

export const metadata = { title: "Terms of Service — Smash Ladder NA" };

export default async function TermsPage() {
  const lang = await getLang();

  if (lang === "es") {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Términos de servicio</h1>
        <p className="mt-1 text-sm text-muted-foreground">Última actualización: 2026-07-19.</p>

        <div className="mt-8 flex flex-col gap-6 text-sm text-muted-foreground">
          <section>
            <h2 className="text-sm font-medium text-foreground">Qué es esto</h2>
            <p className="mt-2">
              Smash Ladder NA es un ladder rankeado de Super Smash Bros. administrado por la
              comunidad, organizado mediante inicio de sesión con Discord. Es gratis. Al iniciar
              sesión, aceptas estos términos.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-medium text-foreground">Cuentas</h2>
            <p className="mt-2">
              Inicias sesión con Discord — no hay una contraseña aparte que gestionar aquí. Eres
              responsable de lo que ocurra bajo tu cuenta, incluyendo partidas, reportes y
              publicaciones hechas desde ella.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-medium text-foreground">Jugar limpio</h2>
            <p className="mt-2">
              Reporta tus propios resultados con honestidad. No hagas no-show, no alargues
              partidas innecesariamente, no molestes a tus rivales, y no presentes reportes de
              conducta de mala fe. Las partidas rankeadas y los free battles son entre tú y tu
              rival — nosotros no arbitramos las partidas en sí, solo la capa de reporte y
              emparejamiento.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-medium text-foreground">
              Reportes de conducta y estado de la cuenta
            </h2>
            <p className="mt-2">
              Otros jugadores pueden reportar mala conducta. Los reportes son revisados por mods
              antes de tomar cualquier acción — presentar un reporte por sí solo no hace nada. Las
              cuentas que acumulan suficientes reportes confirmados por mods se suspenden (solo se
              bloquea el juego rankeado; free battle y nuevos reportes también se bloquean) o se
              banean (todo bloqueado), en una escala gradual. Consulta la{" "}
              <a href="/rules" className="underline">
                página de Reglas
              </a>{" "}
              para más detalles. Las decisiones de estado pueden apelarse a través de un mod o
              admin en el servidor de Discord de la comunidad.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-medium text-foreground">Torneos</h2>
            <p className="mt-2">
              Los torneos de la comunidad se organizan en start.gg; nosotros solo gestionamos las
              inscripciones y el enlace. Las reglas de bracket, disputas y premios (si los hay) de
              un torneo específico los define quien organiza ese torneo, no nosotros.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-medium text-foreground">
              Las clasificaciones no son garantías
            </h2>
            <p className="mt-2">
              Las clasificaciones, rankings e historial de partidas reflejan resultados
              autorreportados y resueltos por disputas, según lo mejor que podemos determinar. No
              garantizamos exactitud frente a manipulación deliberada, y podemos corregir o
              eliminar resultados que resulten fraudulentos.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-medium text-foreground">Sin garantía</h2>
            <p className="mt-2">
              El sitio se ofrece tal cual (&quot;as-is&quot;). No garantizamos disponibilidad
              continua, que el matchmaking siempre te encuentre una partida, ni que el servicio
              esté libre de errores. Nintendo no tiene ninguna afiliación con este sitio — Smash
              Ladder NA es un proyecto comunitario independiente, hecho por fans.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-medium text-foreground">Terminación</h2>
            <p className="mt-2">
              Puedes eliminar tu cuenta en cualquier momento desde tu página de perfil. Podemos
              suspender o banear cuentas por violar estos términos, según el proceso de conducta
              descrito arriba.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-medium text-foreground">Cambios</h2>
            <p className="mt-2">
              Podemos actualizar estos términos conforme el sitio evoluciona. Los cambios
              importantes se reflejarán aquí con una fecha actualizada.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-medium text-foreground">Contacto</h2>
            <p className="mt-2">
              Las preguntas van dirigidas a un mod o admin en el servidor de Discord de la
              comunidad.
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
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
