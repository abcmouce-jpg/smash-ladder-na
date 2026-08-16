import { DISCORD_SERVER_URL, KOFI_URL } from "@/lib/links";
import { getLang } from "@/lib/i18n";

export const metadata = { title: "About — Smash Ladder NA" };

const copy = {
  en: {
    heading: "About",
    subtitle: "Who's behind Smash Ladder NA and what it's for.",
    whatTitle: "What this is",
    what: (
      <>
        Smash Ladder NA is a ranked ladder and matchmaking site for the North American Super Smash Bros. Ultimate
        community. Sign in with Discord, set a region and match preferences, and get paired against opponents around
        your skill level — no bracket, no sign-up window, just queue up and play. Preseason launched July 2026, with a
        full first season to follow.
      </>
    ),
    whyTitle: "Why it exists",
    why: (
      <>
        Competitive Smash has plenty of tournament infrastructure (start.gg and friends) but not much for the
        day-to-day: finding a real ranked opponent outside of an event. This fills that gap — an Elo-style rating,
        seasonal leaderboards, and a Free Battle board for casual games, all built around the North American scene
        specifically.
      </>
    ),
    whoTitle: "Who runs it",
    who: (faqLink: React.ReactNode) => (
      <>
        An independent, fan-run project — not affiliated with Nintendo, start.gg, or any existing ladder/matchmaking
        platform. Moderation is handled by a small volunteer team of mods and admins drawn from the community itself;
        see the {faqLink} for how that&apos;s staffed.
      </>
    ),
    qaPage: "Q&A page",
    contributeTitle: "How can I contribute?",
    contribute: (githubLink: React.ReactNode, discordLink: React.ReactNode) => (
      <>
        The codebase is public on {githubLink}. Bug reports and feature ideas are welcome as issues, and pull requests
        get reviewed — several of the site&apos;s features shipped from community PRs. Not a coder? The {discordLink} is
        just as useful: reporting bugs, suggesting changes, or helping out as a mod all count.
      </>
    ),
    discordServer: "Discord server",
    supportTitle: "Support the project",
    support: (kofiLink: React.ReactNode) => (
      <>
        Hosting and domain costs come out of pocket. If you&apos;d like to help cover that, there&apos;s a {kofiLink} —
        entirely optional, and no in-site perks are tied to it today.
      </>
    ),
    kofiPage: "Ko-fi page",
    contactTitle: "Get in touch",
    contact: (discordLink: React.ReactNode, rulesLink: React.ReactNode, faqLink: React.ReactNode) => (
      <>
        The {discordLink} is where the team actually hangs out — bug reports, feature ideas, ban appeals, and general
        questions all go through there. See the {rulesLink} and {faqLink} pages for anything about how the ladder itself
        works.
      </>
    ),
    communityDiscord: "community Discord server",
    rules: "Rules",
  },
  es: {
    heading: "Acerca de",
    subtitle: "Quién está detrás de Smash Ladder NA y para qué sirve.",
    whatTitle: "Qué es esto",
    what: (
      <>
        Smash Ladder NA es un sitio de liga clasificatoria y emparejamiento para la comunidad de Super Smash Bros.
        Ultimate de Norteamérica. Inicia sesión con Discord, define una región y tus preferencias de partida, y te
        emparejamos con rivales de tu nivel — sin bracket, sin ventana de inscripción, solo entrar a la cola y jugar. La
        preseason arrancó en julio de 2026, con una primera temporada completa después.
      </>
    ),
    whyTitle: "Por qué existe",
    why: (
      <>
        La escena competitiva de Smash tiene mucha infraestructura para torneos (start.gg y similares) pero poco para el
        día a día: encontrar un rival rankeado real fuera de un evento. Esto llena ese vacío — una clasificación estilo
        Elo, tablas de posiciones por temporada, y un tablón de Free Battle para partidas casuales, todo construido
        pensando en la escena de Norteamérica específicamente.
      </>
    ),
    whoTitle: "Quién lo administra",
    who: (faqLink: React.ReactNode) => (
      <>
        Un proyecto independiente, hecho por fans — no afiliado a Nintendo, start.gg, ni ninguna otra plataforma de
        ladder/matchmaking existente. La moderación la lleva un pequeño equipo voluntario de mods y admins de la propia
        comunidad; consulta la {faqLink} para ver cómo se forma ese equipo.
      </>
    ),
    qaPage: "página de Preguntas",
    contributeTitle: "¿Cómo puedo contribuir?",
    contribute: (githubLink: React.ReactNode, discordLink: React.ReactNode) => (
      <>
        El código es público en {githubLink}. Los reportes de bugs e ideas de funciones son bienvenidos como issues, y
        los pull requests se revisan — varias funciones del sitio salieron de PRs de la comunidad. ¿No programas? El{" "}
        {discordLink} es igual de útil: reportar bugs, sugerir cambios, o ayudar como mod, todo cuenta.
      </>
    ),
    discordServer: "servidor de Discord",
    supportTitle: "Apoya el proyecto",
    support: (kofiLink: React.ReactNode) => (
      <>
        El hosting y el dominio se pagan de nuestro bolsillo. Si quieres ayudar a cubrir ese costo, hay una {kofiLink} —
        totalmente opcional, y hoy no hay ninguna ventaja dentro del sitio atada a eso.
      </>
    ),
    kofiPage: "página de Ko-fi",
    contactTitle: "Contacto",
    contact: (discordLink: React.ReactNode, rulesLink: React.ReactNode, faqLink: React.ReactNode) => (
      <>
        El {discordLink} es donde realmente está el equipo — reportes de bugs, ideas de funciones, apelaciones de ban, y
        preguntas en general pasan por ahí. Consulta las páginas de {rulesLink} y {faqLink} para todo lo relacionado con
        el funcionamiento del ladder.
      </>
    ),
    communityDiscord: "servidor de Discord de la comunidad",
    rules: "Reglas",
  },
};

export default async function AboutPage() {
  const lang = await getLang();
  const t = copy[lang];

  const faqLink = (
    <a href="/faq" className="underline">
      {t.qaPage}
    </a>
  );
  const rulesLink = (
    <a href="/rules" className="underline">
      {t.rules}
    </a>
  );
  const githubLink = (
    <a href="https://github.com/abcmouce-jpg/smash-ladder-na" className="underline" target="_blank" rel="noreferrer">
      GitHub
    </a>
  );
  const discordServerLink = (
    <a href={DISCORD_SERVER_URL} className="underline" target="_blank" rel="noreferrer">
      {t.discordServer}
    </a>
  );
  const communityDiscordLink = (
    <a href={DISCORD_SERVER_URL} className="underline" target="_blank" rel="noreferrer">
      {t.communityDiscord}
    </a>
  );
  const kofiLink = (
    <a href={KOFI_URL} className="underline" target="_blank" rel="noreferrer">
      {t.kofiPage}
    </a>
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{t.heading}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>

      <div className="mt-8 flex flex-col gap-6 text-sm text-muted-foreground">
        <section>
          <h2 className="text-sm font-medium text-foreground">{t.whatTitle}</h2>
          <p className="mt-2">{t.what}</p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">{t.whyTitle}</h2>
          <p className="mt-2">{t.why}</p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">{t.whoTitle}</h2>
          <p className="mt-2">{t.who(faqLink)}</p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">{t.contributeTitle}</h2>
          <p className="mt-2">{t.contribute(githubLink, discordServerLink)}</p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">{t.supportTitle}</h2>
          <p className="mt-2">{t.support(kofiLink)}</p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">{t.contactTitle}</h2>
          <p className="mt-2">{t.contact(communityDiscordLink, rulesLink, faqLink)}</p>
        </section>
      </div>
    </main>
  );
}
