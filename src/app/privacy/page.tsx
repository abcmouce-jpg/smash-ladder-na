import { getLang, type Lang } from "@/lib/i18n";
import { SITE_NAME } from "@/lib/site";

export const metadata = { title: `Privacy Policy — ${SITE_NAME}` };

export default async function PrivacyPage() {
  const lang = await getLang();
  const Policy = POLICY[lang];
  return <Policy />;
}

function PrivacyEn() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated 2026-07-19.</p>

      <div className="mt-8 flex flex-col gap-6 text-sm text-muted-foreground">
        <section>
          <h2 className="text-sm font-medium text-foreground">What we collect</h2>
          <p className="mt-2">
            When you sign in with Discord, we receive your Discord user ID, username, avatar, and (if you&apos;ve made
            it available) email address. We don&apos;t see your Discord password or anything outside what Discord&apos;s
            OAuth consent screen shows you.
          </p>
          <p className="mt-2">
            Beyond that, we store what you generate by using the site: ranked matches and results, Friendlies posts,
            match comments, tournament sign-ups, conduct reports you file or receive, and anything you self-declare
            (region, wired-connection status, main character).
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">How we use it</h2>
          <p className="mt-2">
            To run the ladder: matchmaking, rating calculations, leaderboards, match history, and moderation (conduct
            reports, disputes, account status). If a Discord bot token is configured, we also DM you about match and
            tournament events — this only works if the bot and you share a Discord server, per Discord&apos;s own
            restriction.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Who else sees it</h2>
          <p className="mt-2">
            Discord (for sign-in and, optionally, DM notifications) and Neon (our database host) process your data on
            our behalf. We don&apos;t sell your data.
          </p>
          <p className="mt-2">
            Some read-only pages (leaderboard, stats, tournaments, Friendlies) may show ads served by Google AdSense.
            AdSense can set its own cookies and use data about your visits to this and other sites to serve and measure
            ads — this isn&apos;t data we collect or control ourselves. You can see and adjust what Google uses for ad
            personalization at{" "}
            <a href="https://adssettings.google.com" target="_blank" rel="noreferrer" className="underline">
              adssettings.google.com
            </a>
            . We don&apos;t place ads on the lobby or an active match — that experience stays ad-free.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Cookies</h2>
          <p className="mt-2">
            One session cookie, used only to keep you signed in, and one language-preference cookie, used only to
            remember whether you prefer to view the site in English, Spanish, or Japanese. On pages where an ad is
            shown, Google AdSense may also set its own cookies, per the section above — otherwise no tracking or
            advertising cookies are set.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Deleting your account</h2>
          <p className="mt-2">
            From your profile page, you can delete your account at any time. This removes your username, avatar, and
            email immediately. Match results stay on the ladder, anonymized — they involve other players&apos;
            legitimate win/loss records too, so we don&apos;t erase those, but nothing in them will be traceable back to
            you.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Age</h2>
          <p className="mt-2">
            You need a Discord account to use this site, so you already meet Discord&apos;s own minimum age (13+). We
            don&apos;t knowingly collect data from anyone younger than that.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Questions</h2>
          <p className="mt-2">
            Reach out to a mod or admin in the community Discord server, or via the site&apos;s listed contact.
          </p>
        </section>
      </div>
    </main>
  );
}

function PrivacyEs() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Política de privacidad</h1>
      <p className="mt-1 text-sm text-muted-foreground">Última actualización: 2026-07-19.</p>

      <div className="mt-8 flex flex-col gap-6 text-sm text-muted-foreground">
        <section>
          <h2 className="text-sm font-medium text-foreground">Qué recopilamos</h2>
          <p className="mt-2">
            Cuando inicias sesión con Discord, recibimos tu ID de usuario de Discord, nombre de usuario, avatar y (si lo
            has hecho disponible) tu correo electrónico. No vemos tu contraseña de Discord ni nada fuera de lo que
            muestra la pantalla de consentimiento OAuth de Discord.
          </p>
          <p className="mt-2">
            Además de eso, guardamos lo que generas al usar el sitio: partidas rankeadas y sus resultados, publicaciones
            de Amistosos, comentarios de chat de partidas, inscripciones a torneos, reportes de conducta que envías o
            recibes, y cualquier dato autodeclarado (región, estado de conexión por cable, personaje principal).
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Cómo lo usamos</h2>
          <p className="mt-2">
            Para operar el ladder: emparejamiento, cálculo de clasificación, tablas de posiciones, historial de
            partidas, y moderación (reportes de conducta, disputas, estado de la cuenta). Si hay un token de bot de
            Discord configurado, también te enviamos DMs sobre eventos de partidas y torneos — esto solo funciona si el
            bot y tú comparten un servidor de Discord, según la propia restricción de Discord.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Quién más lo ve</h2>
          <p className="mt-2">
            Discord (para el inicio de sesión y, opcionalmente, notificaciones por DM) y Neon (nuestro proveedor de base
            de datos) procesan tus datos en nuestro nombre. No vendemos tus datos.
          </p>
          <p className="mt-2">
            Algunas páginas de solo lectura (tabla de posiciones, estadísticas, torneos, Amistosos) pueden mostrar
            anuncios servidos por Google AdSense. AdSense puede establecer sus propias cookies y usar datos sobre tus
            visitas a este y otros sitios para mostrar y medir anuncios — esto no son datos que nosotros recopilemos o
            controlemos. Puedes ver y ajustar lo que Google usa para la personalización de anuncios en{" "}
            <a href="https://adssettings.google.com" target="_blank" rel="noreferrer" className="underline">
              adssettings.google.com
            </a>
            . No colocamos anuncios en la sala clasificatoria ni durante una partida activa — esa experiencia se
            mantiene libre de anuncios.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Cookies</h2>
          <p className="mt-2">
            Una cookie de sesión, usada solo para mantenerte conectado, y una cookie de preferencia de idioma, usada
            solo para recordar si prefieres ver el sitio en español, inglés o japonés. En páginas donde se muestra un
            anuncio, Google AdSense también puede establecer sus propias cookies, según la sección anterior — fuera de
            eso, no se establecen cookies de rastreo o publicidad.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Eliminar tu cuenta</h2>
          <p className="mt-2">
            Desde tu página de perfil puedes eliminar tu cuenta en cualquier momento. Esto elimina tu nombre de usuario,
            avatar y correo electrónico de inmediato. Los resultados de partidas permanecen en el ladder, anonimizados —
            también involucran los registros legítimos de victorias/derrotas de otros jugadores, así que no los
            borramos, pero nada en ellos podrá rastrearse hasta ti.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Edad</h2>
          <p className="mt-2">
            Necesitas una cuenta de Discord para usar este sitio, así que ya cumples con la edad mínima de Discord
            (13+). No recopilamos conscientemente datos de nadie menor a esa edad.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Preguntas</h2>
          <p className="mt-2">
            Contacta a un mod o admin en el servidor de Discord de la comunidad, o mediante el contacto que aparece en
            el sitio.
          </p>
        </section>
      </div>
    </main>
  );
}

function PrivacyJa() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">プライバシーポリシー</h1>
      <p className="mt-1 text-sm text-muted-foreground">最終更新日: 2026-07-19</p>

      <div className="mt-8 flex flex-col gap-6 text-sm text-muted-foreground">
        <section>
          <h2 className="text-sm font-medium text-foreground">収集する情報</h2>
          <p className="mt-2">
            Discord でログインすると、Discord のユーザー
            ID・ユーザー名・アバター、および（公開設定にしている場合は）メールアドレスを受け取ります。Discord
            のパスワードや、Discord の OAuth 同意画面に表示される範囲を超える情報を見ることはありません。
          </p>
          <p className="mt-2">
            このほか、サイトの利用によって生じる情報を保存します。ランクマッチとその結果、フリー対戦の投稿、試合チャットのコメント、大会への参加登録、送信または受けた行為報告、そしてご自身で申告した情報（地域、有線接続かどうか、メインキャラ）です。
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">利用目的</h2>
          <p className="mt-2">
            ラダーの運営のために使います。マッチング、レートの計算、ランキング、対戦履歴、そしてモデレーション（行為報告、異議申立、アカウントの状態管理）です。Discord
            の bot トークンが設定されている場合は、試合や大会に関する DM もお送りします。Discord 側の制限により、これは
            bot とあなたが同じ Discord サーバーに参加している場合のみ届きます。
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">第三者による取り扱い</h2>
          <p className="mt-2">
            Discord（ログインと、任意の DM 通知のため）と
            Neon（データベースの提供元）が、私たちに代わってデータを処理します。データを販売することはありません。
          </p>
          <p className="mt-2">
            閲覧専用の一部のページ（ランキング、統計、大会、フリー対戦）では、Google AdSense
            による広告が表示される場合があります。AdSense は独自の Cookie
            を設定し、このサイトや他のサイトへの訪問データを広告の配信・測定に使うことがあります。これは私たちが収集・管理するデータではありません。Google
            が広告のパーソナライズに使う情報は{" "}
            <a href="https://adssettings.google.com" target="_blank" rel="noreferrer" className="underline">
              adssettings.google.com
            </a>{" "}
            で確認・変更できます。ロビーや対戦中の画面には広告を置かず、広告なしで遊べるようにしています。
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">Cookie</h2>
          <p className="mt-2">
            ログイン状態を保つためだけのセッション Cookie
            と、表示言語（日本語・英語・スペイン語）の設定を覚えておくためだけの言語設定 Cookie を 1
            つずつ使います。広告が表示されるページでは、上記のとおり Google AdSense が独自の Cookie
            を設定することがありますが、それ以外にトラッキングや広告目的の Cookie は設定しません。
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">アカウントの削除</h2>
          <p className="mt-2">
            プロフィールページからいつでもアカウントを削除できます。ユーザー名・アバター・メールアドレスは即座に削除されます。試合結果は匿名化したうえでラダーに残ります。他のプレイヤーの正当な勝敗記録でもあるため消去はしませんが、そこからあなたを特定することはできなくなります。
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">年齢</h2>
          <p className="mt-2">
            このサイトの利用には Discord アカウントが必要なため、Discord の利用可能年齢（13
            歳以上）を満たしていることが前提です。それより若い方のデータを意図して収集することはありません。
          </p>
        </section>

        <section>
          <h2 className="text-sm font-medium text-foreground">お問い合わせ</h2>
          <p className="mt-2">
            コミュニティの Discord
            サーバーでモデレーターまたは管理者に連絡するか、サイトに記載の連絡先までご連絡ください。
          </p>
        </section>
      </div>
    </main>
  );
}

const POLICY: Record<Lang, () => React.JSX.Element> = {
  en: PrivacyEn,
  es: PrivacyEs,
  ja: PrivacyJa,
};
