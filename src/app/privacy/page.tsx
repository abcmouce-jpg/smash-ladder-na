import { getLang } from "@/lib/i18n";

export const metadata = { title: "Privacy Policy — Smash Ladder NA" };

export default async function PrivacyPage() {
  const lang = await getLang();

  if (lang === "es") {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Política de privacidad</h1>
        <p className="mt-1 text-sm text-muted-foreground">Última actualización: 2026-07-19.</p>

        <div className="mt-8 flex flex-col gap-6 text-sm text-muted-foreground">
          <section>
            <h2 className="text-sm font-medium text-foreground">Qué recopilamos</h2>
            <p className="mt-2">
              Cuando inicias sesión con Discord, recibimos tu ID de usuario de Discord, nombre de
              usuario, avatar y (si lo has hecho disponible) tu correo electrónico. No vemos tu
              contraseña de Discord ni nada fuera de lo que muestra la pantalla de consentimiento
              OAuth de Discord.
            </p>
            <p className="mt-2">
              Además de eso, guardamos lo que generas al usar el sitio: partidas rankeadas y sus
              resultados, publicaciones de Free Battle, comentarios de chat de partidas,
              inscripciones a torneos, reportes de conducta que envías o recibes, y cualquier dato
              autodeclarado (región, estado de conexión por cable, personaje principal).
            </p>
          </section>

          <section>
            <h2 className="text-sm font-medium text-foreground">Cómo lo usamos</h2>
            <p className="mt-2">
              Para operar el ladder: emparejamiento, cálculo de clasificación, tablas de
              posiciones, historial de partidas, y moderación (reportes de conducta, disputas,
              estado de la cuenta). Si hay un token de bot de Discord configurado, también te
              enviamos DMs sobre eventos de partidas y torneos — esto solo funciona si el bot y tú
              comparten un servidor de Discord, según la propia restricción de Discord.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-medium text-foreground">Quién más lo ve</h2>
            <p className="mt-2">
              Discord (para el inicio de sesión y, opcionalmente, notificaciones por DM) y Neon
              (nuestro proveedor de base de datos) procesan tus datos en nuestro nombre. No
              vendemos tus datos.
            </p>
            <p className="mt-2">
              Algunas páginas de solo lectura (tabla de posiciones, personajes, torneos, free
              battle) pueden mostrar anuncios servidos por Google AdSense. AdSense puede
              establecer sus propias cookies y usar datos sobre tus visitas a este y otros sitios
              para mostrar y medir anuncios — esto no son datos que nosotros recopilemos o
              controlemos. Puedes ver y ajustar lo que Google usa para la personalización de
              anuncios en{" "}
              <a
                href="https://adssettings.google.com"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                adssettings.google.com
              </a>
              . No colocamos anuncios en la sala clasificatoria ni durante una partida activa — esa
              experiencia se mantiene libre de anuncios.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-medium text-foreground">Cookies</h2>
            <p className="mt-2">
              Una cookie de sesión, usada solo para mantenerte conectado, y una cookie de
              preferencia de idioma, usada solo para recordar si prefieres ver el sitio en español
              o inglés. En páginas donde se muestra un anuncio, Google AdSense también puede
              establecer sus propias cookies, según la sección anterior — fuera de eso, no se
              establecen cookies de rastreo o publicidad.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-medium text-foreground">Eliminar tu cuenta</h2>
            <p className="mt-2">
              Desde tu página de perfil puedes eliminar tu cuenta en cualquier momento. Esto
              elimina tu nombre de usuario, avatar y correo electrónico de inmediato. Los
              resultados de partidas permanecen en el ladder, anonimizados — también involucran
              los registros legítimos de victorias/derrotas de otros jugadores, así que no los
              borramos, pero nada en ellos podrá rastrearse hasta ti.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-medium text-foreground">Edad</h2>
            <p className="mt-2">
              Necesitas una cuenta de Discord para usar este sitio, así que ya cumples con la edad
              mínima de Discord (13+). No recopilamos conscientemente datos de nadie menor a esa
              edad.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-medium text-foreground">Preguntas</h2>
            <p className="mt-2">
              Contacta a un mod o admin en el servidor de Discord de la comunidad, o mediante el
              contacto que aparece en el sitio.
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated 2026-07-19.</p>

      <div className="mt-8 flex flex-col gap-6 text-sm text-muted-foreground">
        <section>
          <h2 className="text-sm font-medium text-foreground">What we collect</h2>
          <p className="mt-2">
            When you sign in with Discord, we receive your Discord user ID, username, avatar, and
            (if you&apos;ve made it available) email address. We don&apos;t see your Discord
            password or anything outside what Discord&apos;s OAuth consent screen shows you.
          </p>
          <p className="mt-2">
            Beyond that, we store what you generate by using the site: ranked matches and
            results, free battle posts, match comments, tournament sign-ups, conduct reports you
            file or receive, and anything you self-declare (region, wired-connection status,
            main character).
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">How we use it</h2>
          <p className="mt-2">
            To run the ladder: matchmaking, rating calculations, leaderboards, match history, and
            moderation (conduct reports, disputes, account status). If a Discord bot token is
            configured, we also DM you about match and tournament events — this only works if the
            bot and you share a Discord server, per Discord&apos;s own restriction.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Who else sees it</h2>
          <p className="mt-2">
            Discord (for sign-in and, optionally, DM notifications) and Neon (our database host)
            process your data on our behalf. We don&apos;t sell your data.
          </p>
          <p className="mt-2">
            Some read-only pages (leaderboard, characters, tournaments, free battle) may show ads
            served by Google AdSense. AdSense can set its own cookies and use data about your
            visits to this and other sites to serve and measure ads — this isn&apos;t data we
            collect or control ourselves. You can see and adjust what Google uses for ad
            personalization at{" "}
            <a
              href="https://adssettings.google.com"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              adssettings.google.com
            </a>
            . We don&apos;t place ads on the lobby or an active match — that experience stays
            ad-free.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Cookies</h2>
          <p className="mt-2">
            One session cookie, used only to keep you signed in, and one language-preference
            cookie, used only to remember whether you prefer to view the site in English or
            Spanish. On pages where an ad is shown, Google AdSense may also set its own cookies,
            per the section above — otherwise no tracking or advertising cookies are set.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Deleting your account</h2>
          <p className="mt-2">
            From your profile page, you can delete your account at any time. This removes your
            username, avatar, and email immediately. Match results stay on the ladder, anonymized
            — they involve other players&apos; legitimate win/loss records too, so we don&apos;t
            erase those, but nothing in them will be traceable back to you.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Age</h2>
          <p className="mt-2">
            You need a Discord account to use this site, so you already meet Discord&apos;s own
            minimum age (13+). We don&apos;t knowingly collect data from anyone younger than that.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Questions</h2>
          <p className="mt-2">
            Reach out to a mod or admin in the community Discord server, or via the site&apos;s
            listed contact.
          </p>
        </section>
      </div>
    </main>
  );
}
