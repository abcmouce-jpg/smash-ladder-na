import { DISCORD_SERVER_URL, KOFI_URL } from "@/lib/links";
import { getLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { getCurrentGoldSupporters } from "@/lib/supporters";
import { RATING_SYSTEM, SCENE_LABEL, SITE_NAME } from "@/lib/site";
import { tr } from "@/lib/lang";

export const metadata = { title: `About — ${SITE_NAME}` };

const copy = {
  en: {
    heading: "About",
    subtitle: `Who's behind ${SITE_NAME} and what it's for.`,
    whatTitle: "What this is",
    what: (
      <>
        {SITE_NAME} is a ranked ladder and matchmaking site for the North American Super Smash Bros. Ultimate community.
        Sign in with Discord, set a region and match preferences, and get paired against opponents around your skill
        level — no bracket, no sign-up window, just queue up and play. Preseason launched July 2026, with a full first
        season to follow.
      </>
    ),
    whyTitle: "Why it exists",
    why: (
      <>
        Competitive Smash has plenty of tournament infrastructure (start.gg and friends) but not much for the
        day-to-day: finding a real ranked opponent outside of an event. This fills that gap — a Glicko-2 rating,
        seasonal leaderboards, and Friendlies for casual matches, all built around the North American scene
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
        entirely optional. $3+ removes ads and gives you a Supporter badge; $15+ gives a Gold badge and top placement on
        the{" "}
        <a href="/supporters" className="underline">
          supporters page
        </a>
        .
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
    subtitle: `Quién está detrás de ${SITE_NAME} y para qué sirve.`,
    whatTitle: "Qué es esto",
    what: (
      <>
        {SITE_NAME} es un sitio de liga clasificatoria y emparejamiento para la comunidad de Super Smash Bros. Ultimate
        de Norteamérica. Inicia sesión con Discord, define una región y tus preferencias de partida, y te emparejamos
        con rivales de tu nivel — sin bracket, sin ventana de inscripción, solo entrar a la cola y jugar. La preseason
        arrancó en julio de 2026, con una primera temporada completa después.
      </>
    ),
    whyTitle: "Por qué existe",
    why: (
      <>
        La escena competitiva de Smash tiene mucha infraestructura para torneos (start.gg y similares) pero poco para el
        día a día: encontrar un rival rankeado real fuera de un evento. Esto llena ese vacío — una clasificación
        Glicko-2, tablas de posiciones por temporada, y Amistosos para partidas casuales, todo construido pensando en la
        escena de Norteamérica específicamente.
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
        totalmente opcional. $3+ quita los anuncios y te da la insignia de Colaborador; $15+ da la insignia Gold y
        aparece primero en la{" "}
        <a href="/supporters" className="underline">
          página de colaboradores
        </a>
        .
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
  ja: {
    heading: "このサイトについて",
    subtitle: `${SITE_NAME}を誰が、何のために運営しているか。`,
    whatTitle: "これは何か",
    what: (
      <>
        {SITE_NAME}は、{SCENE_LABEL.ja}スマブラSPコミュニティ向けの、レート対戦とマッチングのサイトです。Discord
        でログインし、地域と対戦設定を決めると、近い実力の相手と自動でマッチングします。ブラケットも参加受付の締切もなく、待機して対戦するだけです。
      </>
    ),
    whyTitle: "なぜ作ったか",
    why: (
      <>
        競技としてのスマブラには大会のための仕組み（start.gg など）が揃っている一方で、日常の部分 —
        大会の外で、本気の相手を見つけること — を支えるものは多くありません。ここはその隙間を埋めるためのものです。
        {RATING_SYSTEM === "elo" ? "Elo" : "Glicko-2"}
        レート、シーズンごとのランキング、気軽な対戦のためのフリー対戦を用意しています。
      </>
    ),
    whoTitle: "誰が運営しているか",
    who: (faqLink: React.ReactNode) => (
      <>
        有志による独立した企画で、任天堂、start.gg、既存のラダーやマッチングサービスとは一切関係ありません。運営はコミュニティから集まった少人数のモデレーターと管理者が担っています。体制については
        {faqLink}をご覧ください。
      </>
    ),
    qaPage: "Q&Aページ",
    contributeTitle: "手伝うには",
    contribute: (githubLink: React.ReactNode, discordLink: React.ReactNode) => (
      <>
        ソースコードは{githubLink}で公開しています。不具合の報告や機能の提案は issue
        で歓迎していますし、プルリクエストも確認しています — このサイトの機能のいくつかは、コミュニティからの PR
        で実装されたものです。コードを書かない方でも{discordLink}
        は同じくらい役に立ちます。不具合の報告、改善の提案、モデレーターとしての協力、どれも助かります。
      </>
    ),
    discordServer: "Discord サーバー",
    supportTitle: "支援する",
    support: (kofiLink: React.ReactNode) => (
      <>
        サーバー代とドメイン代は自腹で出しています。負担を分けてもいいという方のために{kofiLink}
        を用意しています（任意です）。$3 以上で広告が消え、サポーターのバッジが付きます。$15 以上でゴールドバッジと、
        <a href="/supporters" className="underline">
          サポーターページ
        </a>
        での上位掲載が付きます。
      </>
    ),
    kofiPage: "Ko-fi のページ",
    contactTitle: "連絡先",
    contact: (discordLink: React.ReactNode, rulesLink: React.ReactNode, faqLink: React.ReactNode) => (
      <>
        {discordLink}
        が運営の集まっている場所です。不具合の報告、機能の提案、利用停止への異議、一般的な質問はすべてそちらで受け付けています。ラダー自体の仕組みについては
        {rulesLink}と{faqLink}をご覧ください。
      </>
    ),
    communityDiscord: "コミュニティの Discord サーバー",
    rules: "ルール",
  },
};

export default async function AboutPage() {
  const [lang, goldSupporters] = await Promise.all([getLang(), getCurrentGoldSupporters()]);
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

        {goldSupporters.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-foreground">
              🏆 {tr(lang, { en: "Gold Supporters", es: "Colaboradores Gold", ja: "ゴールドサポーター" })}
            </h2>
            <p className="mt-2 flex flex-wrap gap-x-1.5 gap-y-1">
              {goldSupporters.map((s, i) => (
                <span key={s.id}>
                  <a href={`/players/${s.id}`} className="underline">
                    {s.username}
                  </a>
                  {i < goldSupporters.length - 1 && ","}
                </span>
              ))}
            </p>
          </section>
        )}

        <section>
          <h2 className="text-sm font-medium text-foreground">{t.contactTitle}</h2>
          <p className="mt-2">{t.contact(communityDiscordLink, rulesLink, faqLink)}</p>
        </section>
      </div>
    </main>
  );
}
