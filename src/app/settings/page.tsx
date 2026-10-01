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
import { MatchFoundSoundPicker } from "@/components/match-found-sound-picker";
import { SectionTabs } from "@/components/section-tabs";
import { SettingsSaveForm } from "@/components/settings-save-form";
import { type MatchFoundSound } from "@/lib/sound";
import { referralLink, getReferralCount } from "@/lib/referrals";
import { getOrCreateSupporterCode, isEffectiveSupporter } from "@/lib/supporters";
import { KOFI_URL } from "@/lib/links";
import { listBlockedUsers } from "@/lib/blocks";
import { DEFAULT_ARENA_PASSWORD } from "@/lib/arena";
import { DEFAULT_QUICK_MESSAGES, MAX_QUICK_MESSAGE_LENGTH } from "@/lib/quick-messages";
import { startggProfileUrl } from "@/lib/startgg-oauth";
import { listApiTokens } from "@/lib/api-tokens";
import { ApiTokensPanel } from "@/components/api-tokens-panel";
import {
  disconnectStartggAction,
  disconnectTwitchAction,
  generateApiTokenAction,
  revokeApiTokenAction,
  updateLobbySettingsAction,
  updateUserSettingsAction,
} from "./actions";
import { getLang, setLangAction, type Lang } from "@/lib/i18n";

// ?tab= picks which group of settings renders, so each stays deep-linkable and
// server-rendered — same pattern as the Stats, Notes, and profile pages.
const VALID_TABS = ["user", "lobby", "apps"] as const;
type SettingsTab = (typeof VALID_TABS)[number];

type TwitchConnection = { username: string; displayName: string | null; profileImageUrl: string | null } | null;
type StartggConnection = { slug: string; gamerTag: string | null } | null;
type ApiTokenSummary = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    startggConnected?: string;
    startggError?: string;
    twitchConnected?: string;
    twitchError?: string;
  }>;
}) {
  const session = await auth();
  const { tab: tabParam, startggConnected, startggError, twitchConnected, twitchError } = await searchParams;
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

  const [me, blocked, referralCount, apiTokens, supporterCode] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        username: true,
        discordUsername: true,
        hideDiscordUsername: true,
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
        matchFoundSound: true,
        notifyQueueOpportunities: true,
        quickMessages: true,
        isSupporter: true,
        supporterExpiresAt: true,
        _count: { select: { pushSubscriptions: true } },
      },
    }),
    listBlockedUsers(session.user.id),
    getReferralCount(session.user.id),
    listApiTokens(session.user.id),
    getOrCreateSupporterCode(session.user.id),
  ]);

  const tab: SettingsTab = VALID_TABS.includes((tabParam ?? "") as SettingsTab) ? (tabParam as SettingsTab) : "user";

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <PageTitle lang={lang} />

      <SectionTabs
        className="mt-8"
        items={[
          { href: "?tab=user", label: lang === "es" ? "Usuario" : "User", active: tab === "user" },
          { href: "?tab=lobby", label: lang === "es" ? "Sala" : "Lobby", active: tab === "lobby" },
          { href: "?tab=apps", label: "Apps", active: tab === "apps" },
        ]}
      />

      {tab === "user" && (
        <UserTab
          userId={session.user.id}
          username={me?.username ?? ""}
          discordUsername={me?.discordUsername ?? null}
          hideDiscordUsername={me?.hideDiscordUsername ?? false}
          blocked={blocked}
          referralCount={referralCount}
          supporterCode={supporterCode}
          isSupporter={isEffectiveSupporter({
            isSupporter: me?.isSupporter ?? false,
            supporterExpiresAt: me?.supporterExpiresAt ?? null,
          })}
          supporterExpiresAt={me?.supporterExpiresAt?.toISOString() ?? null}
          lang={lang}
        />
      )}

      {tab === "lobby" && (
        <LobbyTab
          avoidPracticeOpponents={me?.avoidPracticeOpponents ?? false}
          audioPingOnMatch={me?.audioPingOnMatch ?? true}
          matchFoundSound={me?.matchFoundSound ?? "CHIME"}
          notifyQueueOpportunities={me?.notifyQueueOpportunities ?? false}
          arenaPassword={me?.arenaPassword ?? ""}
          quickMessages={me?.quickMessages ?? []}
          pushEnabled={(me?._count.pushSubscriptions ?? 0) > 0}
          lang={lang}
        />
      )}

      {tab === "apps" && (
        <AppsTab
          userId={session.user.id}
          host={host}
          protocol={protocol}
          twitch={
            me?.twitchUserId && me.twitchUsername
              ? {
                  username: me.twitchUsername,
                  displayName: me.twitchDisplayName,
                  profileImageUrl: me.twitchProfileImageUrl,
                }
              : null
          }
          twitchJustConnected={twitchConnected === "1"}
          twitchError={twitchError}
          startgg={me?.startggUserId && me.startggSlug ? { slug: me.startggSlug, gamerTag: me.startggGamerTag } : null}
          startggJustConnected={startggConnected === "1"}
          startggError={startggError}
          apiTokens={apiTokens.map((token) => ({
            id: token.id,
            name: token.name,
            createdAt: token.createdAt.toISOString(),
            lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
          }))}
          lang={lang}
        />
      )}
    </main>
  );
}

function UserTab({
  userId,
  username,
  discordUsername,
  hideDiscordUsername,
  blocked,
  referralCount,
  supporterCode,
  isSupporter,
  supporterExpiresAt,
  lang,
}: {
  userId: string;
  username: string;
  discordUsername: string | null;
  hideDiscordUsername: boolean;
  blocked: Awaited<ReturnType<typeof listBlockedUsers>>;
  referralCount: number;
  supporterCode: string;
  isSupporter: boolean;
  supporterExpiresAt: string | null;
  lang: Lang;
}) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <Card>
        <CardContent className="pt-4">
          <SettingsSaveForm action={updateUserSettingsAction} lang={lang} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span>{lang === "es" ? "Nombre de usuario" : "Username"}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {lang === "es"
                  ? "Se muestra en todo el sitio en vez de tu nombre de Discord — útil si no coinciden."
                  : "Shown everywhere on the site instead of your Discord name — handy if they don't match."}
              </span>
              <input
                name="username"
                type="text"
                required
                maxLength={32}
                defaultValue={username}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
              />
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                key={String(hideDiscordUsername)}
                type="checkbox"
                name="hideDiscordUsername"
                defaultChecked={hideDiscordUsername}
                className="mt-0.5 size-4 rounded border-border"
              />
              <span>
                <span className="font-medium">
                  {lang === "es" ? "Ocultar mi Discord de mi perfil" : "Hide my Discord from my profile"}
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {lang === "es"
                    ? `Tu perfil muestra tu nombre de usuario de Discord${
                        discordUsername ? ` (${discordUsername})` : ""
                      }, incluso si es igual a tu nombre de usuario aquí. Actívalo para ocultarlo de los demás.`
                    : `Your profile shows your Discord username${
                        discordUsername ? ` (${discordUsername})` : ""
                      }, even when it matches your username here. Turn this on to hide it from everyone else.`}
                </span>
              </span>
            </label>
          </SettingsSaveForm>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <PreferredLanguageForm currentLang={lang} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <InviteLinkCard userId={userId} referralCount={referralCount} lang={lang} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <SupporterCard
            supporterCode={supporterCode}
            isSupporter={isSupporter}
            supporterExpiresAt={supporterExpiresAt}
            lang={lang}
          />
        </CardContent>
      </Card>

      <Card>
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
    </div>
  );
}

function LobbyTab({
  avoidPracticeOpponents,
  audioPingOnMatch,
  matchFoundSound,
  notifyQueueOpportunities,
  arenaPassword,
  quickMessages,
  pushEnabled,
  lang,
}: {
  avoidPracticeOpponents: boolean;
  audioPingOnMatch: boolean;
  matchFoundSound: MatchFoundSound;
  notifyQueueOpportunities: boolean;
  arenaPassword: string;
  quickMessages: string[];
  pushEnabled: boolean;
  lang: Lang;
}) {
  const quickMessageSlots = Array.from({ length: DEFAULT_QUICK_MESSAGES.length }, (_, i) => quickMessages[i] ?? "");

  return (
    <div className="mt-6 flex flex-col gap-4">
      <Card id="push-notifications" className="scroll-mt-24">
        <CardContent className="pt-4">
          <PushNotificationsForm defaultEnabled={pushEnabled} lang={lang} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <SettingsSaveForm action={updateLobbySettingsAction} lang={lang} className="flex flex-col gap-5">
            <label className="flex items-start gap-2 text-sm">
              <input
                key={String(avoidPracticeOpponents)}
                type="checkbox"
                name="avoidPracticeOpponents"
                defaultChecked={avoidPracticeOpponents}
                className="mt-0.5 size-4 rounded border-border"
              />
              <span>
                <span className="font-medium">
                  {lang === "es"
                    ? "No emparejarme con rivales que están practicando"
                    : "Don't match me with opponents who are practicing"}
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {lang === "es"
                    ? "El resultado de un rival en modo práctica no afecta su rango — activa esto para saltarte esas partidas por completo."
                    : "A practicing opponent's result won't affect their rank — turn this on to skip those matches entirely."}
                </span>
              </span>
            </label>

            <div className="flex flex-col gap-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  key={String(audioPingOnMatch)}
                  type="checkbox"
                  name="audioPingOnMatch"
                  defaultChecked={audioPingOnMatch}
                  className="mt-0.5 size-4 rounded border-border"
                />
                <span>
                  <span className="font-medium">
                    {lang === "es" ? "Sonido al ser emparejado" : "Audio ping when matched"}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {lang === "es"
                      ? "Reproduce un sonido en la Sala cuando te emparejan, para que no tengas que quedarte mirando la pestaña todo el tiempo."
                      : "Plays a sound on the Lobby page when you're paired, so you don't have to keep the tab in view the whole time you're queued."}
                  </span>
                </span>
              </label>
              <div className="flex items-center justify-between gap-2 pl-6">
                <span className="text-sm">{lang === "es" ? "Sonido" : "Sound"}</span>
                <MatchFoundSoundPicker key={matchFoundSound} defaultValue={matchFoundSound} lang={lang} />
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                key={String(notifyQueueOpportunities)}
                type="checkbox"
                name="notifyQueueOpportunities"
                defaultChecked={notifyQueueOpportunities}
                className="mt-0.5 size-4 rounded border-border"
              />
              <span>
                <span className="font-medium">
                  {lang === "es" ? "Avisarme de oponentes en la cola" : "Notify me of matchable opponents in queue"}
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {lang === "es"
                    ? "Útil si los rivales para tu rango escasean: te enviamos una notificación push cuando alguien que podría emparejarse contigo entra a la cola y tú no estás en ella. Requiere que las notificaciones push (arriba) estén activadas."
                    : "Useful if matches are rare for your rank — sends a push notification when someone who could match you joins the queue while you're not in it. Requires push notifications (above) to be enabled."}
                </span>
              </span>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{lang === "es" ? "Contraseña de sala" : "Arena password"}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {lang === "es" ? (
                  <>
                    Se muestra a tu rival como la contraseña que debe poner en la sala del juego. Déjalo en blanco para
                    usar el valor por defecto del ladder (
                    <span className="font-medium text-foreground">{DEFAULT_ARENA_PASSWORD}</span>).
                  </>
                ) : (
                  <>
                    Shown to your opponent as what to set the in-game room password to. Leave blank to use the ladder
                    default (<span className="font-medium text-foreground">{DEFAULT_ARENA_PASSWORD}</span>).
                  </>
                )}
              </span>
              <input
                name="arenaPassword"
                type="text"
                maxLength={20}
                defaultValue={arenaPassword}
                placeholder={DEFAULT_ARENA_PASSWORD}
                className="h-8 w-40 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
              />
            </label>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                {lang === "es" ? "Mensajes rápidos del chat" : "Chat quick messages"}
              </p>
              <p className="text-xs text-muted-foreground">
                {lang === "es"
                  ? "Los botones que aparecen sobre el chat de la partida. Deja uno en blanco para usar el valor por defecto."
                  : "The buttons shown above the match chat. Leave one blank to use the site default for that slot."}
              </p>
              <div className="flex flex-wrap gap-2">
                {quickMessageSlots.map((value, i) => (
                  <input
                    key={i}
                    name="quickMessage"
                    type="text"
                    maxLength={MAX_QUICK_MESSAGE_LENGTH}
                    defaultValue={value}
                    placeholder={DEFAULT_QUICK_MESSAGES[i]}
                    className="h-8 w-28 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
                  />
                ))}
              </div>
            </div>
          </SettingsSaveForm>
        </CardContent>
      </Card>
    </div>
  );
}

function AppsTab({
  userId,
  host,
  protocol,
  twitch,
  twitchJustConnected,
  twitchError,
  startgg,
  startggJustConnected,
  startggError,
  apiTokens,
  lang,
}: {
  userId: string;
  host: string;
  protocol: string;
  twitch: TwitchConnection;
  twitchJustConnected: boolean;
  twitchError?: string;
  startgg: StartggConnection;
  startggJustConnected: boolean;
  startggError?: string;
  apiTokens: ApiTokenSummary[];
  lang: Lang;
}) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <Card>
        <CardContent className="pt-4">
          <TwitchConnectCard connected={twitch} justConnected={twitchJustConnected} error={twitchError} lang={lang} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <StartggConnectCard
            connected={startgg}
            justConnected={startggJustConnected}
            error={startggError}
            lang={lang}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <StreamOverlayCard userId={userId} host={host} protocol={protocol} lang={lang} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <p className="mb-1 text-sm font-medium">{lang === "es" ? "Tokens de API" : "API tokens"}</p>
          <ApiTokensPanel
            tokens={apiTokens}
            generateAction={generateApiTokenAction}
            revokeAction={revokeApiTokenAction}
            lang={lang}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function InviteLinkCard({ userId, referralCount, lang }: { userId: string; referralCount: number; lang: Lang }) {
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

function SupporterCard({
  supporterCode,
  isSupporter,
  supporterExpiresAt,
  lang,
}: {
  supporterCode: string;
  isSupporter: boolean;
  supporterExpiresAt: string | null;
  lang: Lang;
}) {
  const expiresLabel = supporterExpiresAt
    ? new Date(supporterExpiresAt).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { dateStyle: "long" })
    : null;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">{lang === "es" ? "Colaborador" : "Supporter"}</p>
      <p className="text-xs text-muted-foreground">
        {lang === "es"
          ? "Dona en Ko-fi y pega este código en el mensaje de la donación para quitar los anuncios y obtener la insignia de colaborador en tu perfil."
          : "Donate on Ko-fi and paste this code into the donation message to remove ads and get the supporter badge on your profile."}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="max-w-full flex-1 truncate rounded-md border border-border bg-muted px-2 py-1 text-xs font-mono">
          {supporterCode}
        </code>
        <CopyButton text={supporterCode} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {isSupporter && expiresLabel
          ? lang === "es"
            ? `Activo hasta el ${expiresLabel} (se extiende con cada pago de Ko-fi).`
            : `Active until ${expiresLabel} (extends with each Ko-fi payment).`
          : isSupporter
            ? lang === "es"
              ? "Activo — otorgado por el staff."
              : "Active — granted by staff."
            : lang === "es"
              ? "Aún no está activo. Puede tardar unos minutos después de donar."
              : "Not active yet. May take a few minutes after donating to show up."}
      </p>
      <a href={KOFI_URL} target="_blank" rel="noreferrer" className="mt-2">
        <Button type="button" variant="outline" size="sm">
          {lang === "es" ? "Ir a Ko-fi" : "Go to Ko-fi"}
        </Button>
      </a>
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
            Usa esta URL como Browser Source en OBS (configurada a <strong>1920 x 1080</strong>) para mostrar tu
            clasificación, partidas recientes, y la partida actual en tu stream.
          </>
        ) : (
          <>
            Use this URL as an OBS Browser Source (set to <strong>1920 x 1080</strong>) to show your rating, recent
            matches, and current match info on stream.
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
  connected: TwitchConnection;
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
          {justConnected && <p className="text-xs text-emerald-600">{lang === "es" ? "¡Conectado!" : "Connected!"}</p>}
          <div className="mt-1 flex items-center gap-2">
            {connected.profileImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={connected.profileImageUrl} alt="" className="size-6 rounded-full" />
            )}
            <span className="font-medium">{connected.displayName ?? connected.username} ✓</span>
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
  connected: StartggConnection;
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
          {justConnected && <p className="text-xs text-emerald-600">{lang === "es" ? "¡Conectado!" : "Connected!"}</p>}
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
      <h1 className="text-2xl font-semibold tracking-tight">{lang === "es" ? "Ajustes" : "Settings"}</h1>
    </div>
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
