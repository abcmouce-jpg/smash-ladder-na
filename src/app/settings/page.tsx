import { headers } from "next/headers";
import { Settings } from "lucide-react";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { OverlayUrlToggle } from "@/components/overlay-url-toggle";
import { CopyButton } from "@/components/copy-button";
import { PushNotificationsForm } from "@/components/push-notifications-form";
import { Card, CardContent } from "@/components/ui/card";
import { ArenaPasswordForm } from "@/components/arena-password-form";
import { UsernameForm } from "@/components/username-form";
import { referralLink, getReferralCount } from "@/lib/referrals";
import { listBlockedUsers } from "@/lib/blocks";
import { DEFAULT_ARENA_PASSWORD } from "@/lib/arena";
import { startggProfileUrl } from "@/lib/startgg-oauth";
import {
  disconnectStartggAction,
  disconnectTwitchAction,
  updateArenaPassword,
  updateAudioPingOnMatchSetting,
  updateAvoidPracticeOpponentsSetting,
  updateUsernameAction,
} from "./actions";
import { getLang, setLangAction, type Lang } from "@/lib/i18n";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ startggConnected?: string; startggError?: string; twitchConnected?: string; twitchError?: string }>;
}) {
  const session = await auth();
  const { startggConnected, startggError, twitchConnected, twitchError } = await searchParams;
  const host = (await headers()).get("host") ?? "";
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  const lang = await getLang();

  if (!session?.user?.id) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <PageTitle lang={lang} />
        <p className="mt-2 text-sm text-muted-foreground">
          {lang === "es"
            ? "Inicia sesión con Discord (arriba a la derecha) para administrar tus ajustes."
            : "Sign in with Discord (top right) to manage your settings."}
        </p>
      </main>
    );
  }

  const [me, blocked, referralCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        username: true,
        startggUserId: true,
        startggSlug: true,
        startggGamerTag: true,
        twitchUserId: true,
        twitchUsername: true,
        twitchDisplayName: true,
        twitchProfileImageUrl: true,
        arenaPassword: true,
        avoidPracticeOpponents: true,
        audioPingOnMatch: true,
        _count: { select: { pushSubscriptions: true } },
      },
    }),
    listBlockedUsers(session.user.id),
    getReferralCount(session.user.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <PageTitle lang={lang} />

      <Card className="mt-8">
        <CardContent className="pt-4">
          <UsernameForm defaultValue={me?.username ?? ""} action={updateUsernameAction} lang={lang} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <TwitchConnectCard
            connected={
              me?.twitchUserId && me.twitchUsername
                ? { username: me.twitchUsername, displayName: me.twitchDisplayName, profileImageUrl: me.twitchProfileImageUrl }
                : null
            }
            justConnected={twitchConnected === "1"}
            error={twitchError}
            lang={lang}
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <InviteLinkCard userId={session.user.id} referralCount={referralCount} lang={lang} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <StreamOverlayCard userId={session.user.id} host={host} protocol={protocol} lang={lang} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <StartggConnectCard
            connected={
              me?.startggUserId && me.startggSlug
                ? { slug: me.startggSlug, gamerTag: me.startggGamerTag }
                : null
            }
            justConnected={startggConnected === "1"}
            error={startggError}
            lang={lang}
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <AvoidPracticeOpponentsForm defaultValue={me?.avoidPracticeOpponents ?? false} lang={lang} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <AudioPingOnMatchForm defaultValue={me?.audioPingOnMatch ?? true} lang={lang} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <PushNotificationsForm
            defaultEnabled={(me?._count.pushSubscriptions ?? 0) > 0}
            lang={lang}
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <PreferredLanguageForm currentLang={lang} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <ArenaPasswordForm
            action={updateArenaPassword}
            defaultValue={me?.arenaPassword ?? ""}
            fallback={DEFAULT_ARENA_PASSWORD}
            lang={lang}
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <p className="text-sm font-medium">{lang === "es" ? "Jugadores bloqueados" : "Blocked players"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lang === "es"
              ? "Los jugadores bloqueados nunca se emparejan contigo en la cola rankeada. Bloquear es permanente y no se puede deshacer."
              : "Blocked players are never matched with you in ranked queueing. Blocking is permanent and can't be undone."}
          </p>
          {blocked.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {lang === "es" ? "No has bloqueado a nadie." : "You haven't blocked anyone."}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {blocked.map((b) => (
                <li key={b.id} className="text-sm">
                  <Link href={`/players/${b.blocked.id}`} className="hover:underline">
                    {b.blocked.username}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function InviteLinkCard({
  userId,
  referralCount,
  lang,
}: {
  userId: string;
  referralCount: number;
  lang: Lang;
}) {
  const link = referralLink(userId);

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">{lang === "es" ? "Invita a un amigo" : "Invite a friend"}</p>
      <p className="text-xs text-muted-foreground">
        {lang === "es"
          ? "Comparte este enlace — cuando alguien se registre a través de él, contará como tu invitación."
          : "Share this link — anyone who signs up through it counts as your invite."}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="max-w-full flex-1 truncate rounded-md border border-border bg-muted px-2 py-1 text-xs font-mono">
          {link}
        </code>
        <CopyButton text={link} />
      </div>
      <p className="mt-2 text-xs tabular-nums text-muted-foreground">
        {lang === "es"
          ? `${referralCount} ${referralCount === 1 ? "persona invitada ha" : "personas invitadas han"} empezado a jugar.`
          : `${referralCount} ${referralCount === 1 ? "person you invited has" : "people you invited have"} started playing.`}
      </p>
    </div>
  );
}

function StreamOverlayCard({
  userId,
  host,
  protocol,
  lang,
}: {
  userId: string;
  host: string;
  protocol: string;
  lang: Lang;
}) {
  const overlayUrl = `${protocol}://${host}/stream/overlay/${userId}`;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">{lang === "es" ? "Overlay de stream" : "Stream overlay"}</p>
      <p className="text-xs text-muted-foreground">
        {lang === "es" ? (
          <>
            Usa esta URL como Browser Source en OBS (configurada a <strong>1920 x 1080</strong>)
            para mostrar tu clasificación, partidas recientes, y la partida actual en tu stream.
          </>
        ) : (
          <>
            Use this URL as an OBS Browser Source (set to <strong>1920 x 1080</strong>) to show your
            rating, recent matches, and current match info on stream.
          </>
        )}
      </p>
      <div className="mt-3">
        <OverlayUrlToggle baseUrl={overlayUrl} />
      </div>
    </div>
  );
}

function TwitchConnectCard({
  connected,
  justConnected,
  error,
  lang,
}: {
  connected: { username: string; displayName: string | null; profileImageUrl: string | null } | null;
  justConnected: boolean;
  error?: string;
  lang: Lang;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">{lang === "es" ? "Cuenta de Twitch" : "Twitch account"}</p>
      <p className="text-xs text-muted-foreground">
        {lang === "es"
          ? "Conecta tu cuenta de Twitch para acceder a una página de overlay personalizada. El overlay muestra tu clasificación, rango, y partidas recientes — perfecto como Browser Source de OBS para tu stream."
          : "Connect your Twitch account to access a custom stream overlay page. The overlay shows your rating, rank, and recent matches — perfect as an OBS Browser Source for your stream."}
      </p>
      {connected ? (
        <>
          {justConnected && (
            <p className="text-xs text-emerald-600">{lang === "es" ? "¡Conectado!" : "Connected!"}</p>
          )}
          <div className="mt-1 flex items-center gap-2">
            {connected.profileImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={connected.profileImageUrl}
                alt=""
                className="size-6 rounded-full"
              />
            )}
            <span className="font-medium">
              {connected.displayName ?? connected.username} ✓
            </span>
            <form action={disconnectTwitchAction}>
              <Button type="submit" size="sm" variant="outline">
                {lang === "es" ? "Desconectar" : "Disconnect"}
              </Button>
            </form>
          </div>
        </>
      ) : (
        <a href="/api/twitch/connect" className="mt-1 self-start">
          <Button type="button" size="sm">
            {lang === "es" ? "Conectar con Twitch" : "Connect with Twitch"}
          </Button>
        </a>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function StartggConnectCard({
  connected,
  justConnected,
  error,
  lang,
}: {
  connected: { slug: string; gamerTag: string | null } | null;
  justConnected: boolean;
  error?: string;
  lang: Lang;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">{lang === "es" ? "Perfil de start.gg" : "start.gg profile"}</p>
      <p className="text-xs text-muted-foreground">
        {lang === "es"
          ? "Verificado mediante inicio de sesión de start.gg, no un enlace que escribes — así nadie más puede adjudicarse tus resultados."
          : "Verified via start.gg sign-in, not a link you type in — so nobody else can claim your results as their own."}
      </p>
      {connected ? (
        <>
          {justConnected && (
            <p className="text-xs text-emerald-600">{lang === "es" ? "¡Conectado!" : "Connected!"}</p>
          )}
          <div className="mt-1 flex items-center gap-2">
            <a
              href={startggProfileUrl(connected.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline"
            >
              {connected.gamerTag ?? connected.slug} ✓
            </a>
            <form action={disconnectStartggAction}>
              <Button type="submit" size="sm" variant="outline">
                {lang === "es" ? "Desconectar" : "Disconnect"}
              </Button>
            </form>
          </div>
        </>
      ) : (
        <a href="/api/startgg/connect" className="mt-1 self-start">
          <Button type="button" size="sm">
            {lang === "es" ? "Conectar con start.gg" : "Connect with start.gg"}
          </Button>
        </a>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function PageTitle({ lang }: { lang: Lang }) {
  return (
    <div className="flex items-center gap-2">
      <Settings className="size-5 text-muted-foreground" />
      <h1 className="text-2xl font-semibold tracking-tight">
        {lang === "es" ? "Ajustes" : "Settings"}
      </h1>
    </div>
  );
}

function AvoidPracticeOpponentsForm({ defaultValue, lang }: { defaultValue: boolean; lang: Lang }) {
  async function action(formData: FormData) {
    "use server";
    await updateAvoidPracticeOpponentsSetting(formData.get("avoidPracticeOpponents") === "on");
  }

  return (
    <form action={action} className="flex items-end justify-between gap-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          key={String(defaultValue)}
          type="checkbox"
          name="avoidPracticeOpponents"
          defaultChecked={defaultValue}
          className="size-4 rounded border-border"
        />
        <span>
          {lang === "es"
            ? "No emparejarme con rivales que están practicando"
            : "Don't match me with opponents who are practicing"}
          <span className="block text-xs font-normal text-muted-foreground">
            {lang === "es"
              ? "El resultado de un rival en modo práctica no afecta su rango — activa esto para saltarte esas partidas por completo."
              : "A practicing opponent's result won't affect their rank — turn this on to skip those matches entirely."}
          </span>
        </span>
      </label>
      <Button type="submit" size="sm">
        {lang === "es" ? "Guardar" : "Save"}
      </Button>
    </form>
  );
}

function AudioPingOnMatchForm({ defaultValue, lang }: { defaultValue: boolean; lang: Lang }) {
  async function action(formData: FormData) {
    "use server";
    await updateAudioPingOnMatchSetting(formData.get("audioPingOnMatch") === "on");
  }

  return (
    <form action={action} className="flex items-end justify-between gap-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          key={String(defaultValue)}
          type="checkbox"
          name="audioPingOnMatch"
          defaultChecked={defaultValue}
          className="size-4 rounded border-border"
        />
        <span>
          {lang === "es" ? "Sonido al ser emparejado" : "Audio ping when matched"}
          <span className="block text-xs font-normal text-muted-foreground">
            {lang === "es"
              ? "Reproduce un tono corto en la Sala cuando te emparejan, para que no tengas que quedarte mirando la pestaña todo el tiempo."
              : "Plays a short chime on the Lobby page when you're paired, so you don't have to keep the tab in view the whole time you're queued."}
          </span>
        </span>
      </label>
      <Button type="submit" size="sm">
        {lang === "es" ? "Guardar" : "Save"}
      </Button>
    </form>
  );
}

function PreferredLanguageForm({ currentLang }: { currentLang: Lang }) {
  async function setEnglish() {
    "use server";
    await setLangAction("en");
  }
  async function setSpanish() {
    "use server";
    await setLangAction("es");
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-sm">
        <p>{currentLang === "es" ? "Idioma" : "Language"}</p>
        <p className="text-xs font-normal text-muted-foreground">
          {currentLang === "es"
            ? "Cambia el idioma de todo el sitio (excepto las páginas de administración). También puedes cambiarlo desde el enlace en la parte superior de cualquier página."
            : "Changes the language across the whole site (except admin pages). You can also switch it from the link at the top of any page."}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <form action={setEnglish}>
          <Button type="submit" size="sm" variant={currentLang === "en" ? "default" : "outline"}>
            English
          </Button>
        </form>
        <form action={setSpanish}>
          <Button type="submit" size="sm" variant={currentLang === "es" ? "default" : "outline"}>
            Español
          </Button>
        </form>
      </div>
    </div>
  );
}
