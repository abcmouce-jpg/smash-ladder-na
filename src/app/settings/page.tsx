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
import { NOTIFICATION_DEFS, isNotificationEnabled, type NotificationDef } from "@/lib/notifications";
import { type MatchFoundSound } from "@/lib/sound";
import { referralLink, getReferralCount } from "@/lib/referrals";
import {
  getOrCreateSupporterCode,
  isEffectiveSupporter,
  isEffectiveGoldSupporter,
  GOLD_SUPPORTER_MIN_AMOUNT_USD,
  POST_MATCH_MESSAGE_MAX_LENGTH,
} from "@/lib/supporters";
import { KOFI_URL } from "@/lib/links";
import { listBlockedUsers, MAX_BLOCKS_PER_USER } from "@/lib/blocks";
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
  updateNotificationSettingsAction,
  updateUserSettingsAction,
  updatePostMatchMessageAction,
  updateStreamLinksAction,
} from "./actions";
import { getLang, setLangAction, type Lang } from "@/lib/i18n";
import { tr, trNode } from "@/lib/lang";
import { HAS_KOFI, SITE_LANGS } from "@/lib/site";
import { LIVE_DECLARATION_TTL_MS } from "@/lib/stream-links";

const LIVE_DECLARATION_HOURS = LIVE_DECLARATION_TTL_MS / (60 * 60 * 1000);

// ?tab= picks which group of settings renders, so each stays deep-linkable and
// server-rendered — same pattern as the Stats, Notes, and profile pages.
const VALID_TABS = ["user", "lobby", "notifications", "apps"] as const;
type SettingsTab = (typeof VALID_TABS)[number];

type TwitchConnection = {
  username: string;
  displayName: string | null;
  profileImageUrl: string | null;
} | null;
type StartggConnection = { slug: string; gamerTag: string | null } | null;
type ApiTokenSummary = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};

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
          {tr(lang, {
            en: "Sign in with Discord (top right) to manage your settings.",
            es: "Inicia sesión con Discord (arriba a la derecha) para administrar tus ajustes.",
            ja: "右上の Discord でログインすると、設定を変更できます。",
          })}
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
        youtubeChannelUrl: true,
        liveStreamUrl: true,
        arenaPassword: true,
        avoidPracticeOpponents: true,
        audioPingOnMatch: true,
        matchFoundSound: true,
        notifyQueueOpportunities: true,
        notifyQueueOpportunitiesDm: true,
        notificationsDisabled: true,
        quickMessages: true,
        isSupporter: true,
        isGoldSupporter: true,
        supporterExpiresAt: true,
        postMatchMessage: true,
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
          {
            href: "?tab=user",
            label: tr(lang, { en: "User", es: "Usuario", ja: "ユーザー" }),
            active: tab === "user",
          },
          {
            href: "?tab=lobby",
            label: tr(lang, { en: "Lobby", es: "Sala", ja: "ロビー" }),
            active: tab === "lobby",
          },
          {
            href: "?tab=notifications",
            label: tr(lang, {
              en: "Notifications",
              es: "Notificaciones",
              ja: "通知",
            }),
            active: tab === "notifications",
          },
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
          isGoldSupporter={isEffectiveGoldSupporter({
            isSupporter: me?.isSupporter ?? false,
            isGoldSupporter: me?.isGoldSupporter ?? false,
            supporterExpiresAt: me?.supporterExpiresAt ?? null,
          })}
          supporterExpiresAt={me?.supporterExpiresAt?.toISOString() ?? null}
          postMatchMessage={me?.postMatchMessage ?? ""}
          lang={lang}
        />
      )}

      {tab === "lobby" && (
        <LobbyTab
          avoidPracticeOpponents={me?.avoidPracticeOpponents ?? false}
          audioPingOnMatch={me?.audioPingOnMatch ?? true}
          matchFoundSound={me?.matchFoundSound ?? "CHIME"}
          arenaPassword={me?.arenaPassword ?? ""}
          quickMessages={me?.quickMessages ?? []}
          lang={lang}
        />
      )}

      {tab === "notifications" && (
        <NotificationsTab
          notificationsDisabled={me?.notificationsDisabled ?? []}
          notifyQueueOpportunities={me?.notifyQueueOpportunities ?? false}
          notifyQueueOpportunitiesDm={me?.notifyQueueOpportunitiesDm ?? false}
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
          liveStreamUrl={me?.liveStreamUrl ?? null}
          youtubeChannelUrl={me?.youtubeChannelUrl ?? null}
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
  isGoldSupporter,
  supporterExpiresAt,
  postMatchMessage,
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
  isGoldSupporter: boolean;
  supporterExpiresAt: string | null;
  postMatchMessage: string;
  lang: Lang;
}) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <Card>
        <CardContent className="pt-4">
          <SettingsSaveForm action={updateUserSettingsAction} lang={lang} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span>
                {tr(lang, {
                  en: "Username",
                  es: "Nombre de usuario",
                  ja: "ユーザー名",
                })}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {tr(lang, {
                  en: "Shown everywhere on the site instead of your Discord name — handy if they don't match.",
                  es: "Se muestra en todo el sitio en vez de tu nombre de Discord — útil si no coinciden.",
                  ja: "サイト上では Discord の名前ではなく、この名前が表示されます。名前を揃えたくない場合に便利です。",
                })}
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
                  {tr(lang, {
                    en: "Hide my Discord from my profile",
                    es: "Ocultar mi Discord de mi perfil",
                    ja: "プロフィールで Discord を非表示にする",
                  })}
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {tr(lang, {
                    en: `Your profile shows your Discord username${
                      discordUsername ? ` (${discordUsername})` : ""
                    }, even when it matches your username here. Turn this on to hide it from everyone else.`,
                    es: `Tu perfil muestra tu nombre de usuario de Discord${
                      discordUsername ? ` (${discordUsername})` : ""
                    }, incluso si es igual a tu nombre de usuario aquí. Actívalo para ocultarlo de los demás.`,
                    ja: `プロフィールには Discord のユーザー名${
                      discordUsername ? `（${discordUsername}）` : ""
                    }が表示されます。ここのユーザー名と同じ場合も表示されます。これをオンにすると、他の人からは見えなくなります。`,
                  })}
                </span>
              </span>
            </label>
          </SettingsSaveForm>
        </CardContent>
      </Card>

      {SITE_LANGS.length > 1 && (
        <Card>
          <CardContent className="pt-4">
            <PreferredLanguageForm currentLang={lang} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          <InviteLinkCard userId={userId} referralCount={referralCount} lang={lang} />
        </CardContent>
      </Card>

      {HAS_KOFI && (
        <Card>
          <CardContent className="pt-4">
            <SupporterCard
              supporterCode={supporterCode}
              isSupporter={isSupporter}
              isGoldSupporter={isGoldSupporter}
              supporterExpiresAt={supporterExpiresAt}
              postMatchMessage={postMatchMessage}
              lang={lang}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-medium">
            {tr(lang, {
              en: "Blocked players",
              es: "Jugadores bloqueados",
              ja: "ブロックしたプレイヤー",
            })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tr(lang, {
              en: `Blocked players are never matched with you in ranked queueing. Blocking is permanent and can't be undone. You've used ${blocked.length} of ${MAX_BLOCKS_PER_USER}.`,
              es: `Los jugadores bloqueados nunca se emparejan contigo en la cola rankeada. Bloquear es permanente y no se puede deshacer. Has usado ${blocked.length} de ${MAX_BLOCKS_PER_USER}.`,
              ja: `ブロックしたプレイヤーとは、レート対戦でマッチングしません。ブロックは永続で、解除できません。現在${MAX_BLOCKS_PER_USER}件中${blocked.length}件を使用しています。`,
            })}
          </p>
          {blocked.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {tr(lang, {
                en: "You haven't blocked anyone.",
                es: "No has bloqueado a nadie.",
                ja: "まだ誰もブロックしていません。",
              })}
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
  arenaPassword,
  quickMessages,
  lang,
}: {
  avoidPracticeOpponents: boolean;
  audioPingOnMatch: boolean;
  matchFoundSound: MatchFoundSound;
  arenaPassword: string;
  quickMessages: string[];
  lang: Lang;
}) {
  const quickMessageSlots = Array.from({ length: DEFAULT_QUICK_MESSAGES.length }, (_, i) => quickMessages[i] ?? "");

  return (
    <div className="mt-6 flex flex-col gap-4">
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
                  {tr(lang, {
                    en: "Don't match me with opponents who are practicing",
                    es: "No emparejarme con rivales que están practicando",
                    ja: "練習中の相手とはマッチしない",
                  })}
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {tr(lang, {
                    en: "A practicing opponent's result won't affect their rank — turn this on to skip those matches entirely.",
                    es: "El resultado de un rival en modo práctica no afecta su rango — activa esto para saltarte esas partidas por completo.",
                    ja: "練習中の相手の結果は、相手のランクに影響しません。これをオンにすると、そうした対戦自体を避けられます。",
                  })}
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
                    {tr(lang, {
                      en: "Audio ping when matched",
                      es: "Sonido al ser emparejado",
                      ja: "マッチしたら音で知らせる",
                    })}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {tr(lang, {
                      en: "Plays a sound on the Lobby page when you're paired, so you don't have to keep the tab in view the whole time you're queued.",
                      es: "Reproduce un sonido en la Sala cuando te emparejan, para que no tengas que quedarte mirando la pestaña todo el tiempo.",
                      ja: "マッチが成立するとロビーのページで音が鳴ります。待機中ずっとタブを開いて見ておく必要がなくなります。",
                    })}
                  </span>
                </span>
              </label>
              <div className="flex items-center justify-between gap-2 pl-6">
                <span className="text-sm">{tr(lang, { en: "Sound", es: "Sonido", ja: "音" })}</span>
                <MatchFoundSoundPicker key={matchFoundSound} defaultValue={matchFoundSound} lang={lang} />
              </div>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">
                {tr(lang, {
                  en: "Arena password",
                  es: "Contraseña de sala",
                  ja: "アリーナのパスワード",
                })}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {trNode(lang, {
                  en: (
                    <>
                      Shown to your opponent as what to set the in-game room password to. Leave blank to use the ladder
                      default (<span className="font-medium text-foreground">{DEFAULT_ARENA_PASSWORD}</span>
                      ).
                    </>
                  ),
                  es: (
                    <>
                      Se muestra a tu rival como la contraseña que debe poner en la sala del juego. Déjalo en blanco
                      para usar el valor por defecto del ladder (
                      <span className="font-medium text-foreground">{DEFAULT_ARENA_PASSWORD}</span>
                      ).
                    </>
                  ),
                  ja: (
                    <>
                      ゲーム内の部屋に設定するパスワードとして、相手に表示されます。空欄にすると既定値（
                      <span className="font-medium text-foreground">{DEFAULT_ARENA_PASSWORD}</span>
                      ）が使われます。
                    </>
                  ),
                })}
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
                {tr(lang, {
                  en: "Chat quick messages",
                  es: "Mensajes rápidos del chat",
                  ja: "チャットの定型文",
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {tr(lang, {
                  en: "The buttons shown above the match chat. Leave one blank to use the site default for that slot.",
                  es: "Los botones que aparecen sobre el chat de la partida. Deja uno en blanco para usar el valor por defecto.",
                  ja: "試合チャットの上に表示されるボタンです。空欄にすると、その枠は既定の文言になります。",
                })}
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

// One settings toggle, rendered from the shared registry (lib/notifications.ts)
// so the copy and the stored key can't drift apart. Opt-out toggles submit their
// key as a checked `notifications` value (the action rebuilds
// notificationsDisabled from whatever is left checked); the opt-in
// queue-opportunity push submits under its own field.
function NotificationToggle({ def, enabled, lang }: { def: NotificationDef; enabled: boolean; lang: Lang }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        key={String(enabled)}
        type="checkbox"
        name={def.field ?? "notifications"}
        value={def.field ? undefined : def.key}
        defaultChecked={enabled}
        className="mt-0.5 size-4 rounded border-border"
      />
      <span>
        <span className="font-medium">{def.label[lang]}</span>
        <span className="block text-xs font-normal text-muted-foreground">{def.description[lang]}</span>
      </span>
    </label>
  );
}

function NotificationsTab({
  notificationsDisabled,
  notifyQueueOpportunities,
  notifyQueueOpportunitiesDm,
  pushEnabled,
  lang,
}: {
  notificationsDisabled: string[];
  notifyQueueOpportunities: boolean;
  notifyQueueOpportunitiesDm: boolean;
  pushEnabled: boolean;
  lang: Lang;
}) {
  const prefs = {
    notificationsDisabled,
    notifyQueueOpportunities,
    notifyQueueOpportunitiesDm,
  };
  const pushTypes = NOTIFICATION_DEFS.filter((def) => def.channel === "push");
  const dmTypes = NOTIFICATION_DEFS.filter((def) => def.channel === "discord");

  return (
    <div className="mt-6 flex flex-col gap-4">
      <Card id="push-notifications" className="scroll-mt-24">
        <CardContent className="pt-4">
          <PushNotificationsForm defaultEnabled={pushEnabled} lang={lang} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <SettingsSaveForm action={updateNotificationSettingsAction} lang={lang} className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">
                {tr(lang, {
                  en: "Browser push",
                  es: "Notificaciones push",
                  ja: "ブラウザのプッシュ通知",
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {tr(lang, {
                  en: "What to send to the browser, once push is enabled above.",
                  es: "Qué enviar al navegador, una vez activado arriba.",
                  ja: "上でプッシュ通知を有効にしたうえで、何を送るかを選べます。",
                })}
              </p>
              {pushTypes.map((def) => (
                <NotificationToggle
                  key={def.key}
                  def={def}
                  enabled={isNotificationEnabled(prefs, def.key)}
                  lang={lang}
                />
              ))}
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <p className="text-sm font-medium">
                {tr(lang, {
                  en: "Discord DMs",
                  es: "MD de Discord",
                  ja: "Discord の DM",
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {tr(lang, {
                  en: "The bot can only DM you if you share a server with it and have DMs from server members enabled.",
                  es: "El bot solo puede enviarte un MD si compartes servidor con él y tienes activados los MD de miembros del servidor.",
                  ja: "bot が DM を送れるのは、bot と同じサーバーに参加していて、サーバーメンバーからの DM を許可している場合のみです。",
                })}
              </p>
              {dmTypes.map((def) => (
                <NotificationToggle
                  key={def.key}
                  def={def}
                  enabled={isNotificationEnabled(prefs, def.key)}
                  lang={lang}
                />
              ))}
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
  liveStreamUrl,
  youtubeChannelUrl,
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
  liveStreamUrl: string | null;
  youtubeChannelUrl: string | null;
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
          <StreamLinksCard liveStreamUrl={liveStreamUrl} youtubeChannelUrl={youtubeChannelUrl} lang={lang} />
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
          <p className="mb-1 text-sm font-medium">
            {tr(lang, {
              en: "API tokens",
              es: "Tokens de API",
              ja: "API トークン",
            })}
          </p>
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
      <p className="font-medium">
        {tr(lang, {
          en: "Invite a friend",
          es: "Invita a un amigo",
          ja: "友達を招待する",
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        {tr(lang, {
          en: "Share this link — anyone who signs up through it counts as your invite.",
          es: "Comparte este enlace — cuando alguien se registre a través de él, contará como tu invitación.",
          ja: "このリンクを共有してください。ここから登録した人が、あなたの招待として記録されます。",
        })}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="max-w-full flex-1 truncate rounded-md border border-border bg-muted px-2 py-1 text-xs font-mono">
          {link}
        </code>
        <CopyButton text={link} />
      </div>
      <p className="mt-2 text-xs tabular-nums text-muted-foreground">
        {tr(lang, {
          en: `${referralCount} ${referralCount === 1 ? "person you invited has" : "people you invited have"} started playing.`,
          es: `${referralCount} ${referralCount === 1 ? "persona invitada ha" : "personas invitadas han"} empezado a jugar.`,
          ja: `あなたが招待した${referralCount}人がプレイを始めました。`,
        })}
      </p>
    </div>
  );
}

function SupporterCard({
  supporterCode,
  isSupporter,
  isGoldSupporter,
  supporterExpiresAt,
  postMatchMessage,
  lang,
}: {
  supporterCode: string;
  isSupporter: boolean;
  isGoldSupporter: boolean;
  supporterExpiresAt: string | null;
  postMatchMessage: string;
  lang: Lang;
}) {
  const expiresLabel = supporterExpiresAt
    ? new Date(supporterExpiresAt).toLocaleDateString(tr(lang, { en: "en-US", es: "es-MX", ja: "ja-JP" }), {
        dateStyle: "long",
      })
    : null;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">
        {isGoldSupporter
          ? tr(lang, {
              en: "🏆 Gold Supporter",
              es: "🏆 Colaborador Gold",
              ja: "🏆 ゴールドサポーター",
            })
          : tr(lang, { en: "Supporter", es: "Colaborador", ja: "サポーター" })}
      </p>
      <p className="text-xs text-muted-foreground">
        {tr(lang, {
          en: `Donate on Ko-fi and paste this code into the donation message. $3+ removes ads and gives the supporter badge; $${GOLD_SUPPORTER_MIN_AMOUNT_USD}+ gives the Gold badge and top placement on the supporters page.`,
          es: `Dona en Ko-fi y pega este código en el mensaje de la donación. $3+ quita los anuncios y da la insignia de colaborador; $${GOLD_SUPPORTER_MIN_AMOUNT_USD}+ da la insignia Gold y aparece primero en la página de colaboradores.`,
          ja: `Ko-fi で寄付し、寄付メッセージにこのコードを貼り付けてください。$3以上で広告が消え、サポーターのバッジが付きます。$${GOLD_SUPPORTER_MIN_AMOUNT_USD}以上でゴールドバッジと、サポーターページでの上位掲載が付きます。`,
        })}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="max-w-full flex-1 truncate rounded-md border border-border bg-muted px-2 py-1 text-xs font-mono">
          {supporterCode}
        </code>
        <CopyButton text={supporterCode} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {isSupporter && expiresLabel
          ? tr(lang, {
              en: `Active until ${expiresLabel} (extends with each Ko-fi payment).`,
              es: `Activo hasta el ${expiresLabel} (se extiende con cada pago de Ko-fi).`,
              ja: `${expiresLabel}まで有効（Ko-fi での支払いごとに延長されます）。`,
            })
          : isSupporter
            ? tr(lang, {
                en: "Active — granted by staff.",
                es: "Activo — otorgado por el staff.",
                ja: "有効 — スタッフによる付与です。",
              })
            : tr(lang, {
                en: "Not active yet. May take a few minutes after donating to show up.",
                es: "Aún no está activo. Puede tardar unos minutos después de donar.",
                ja: "まだ有効ではありません。寄付の反映に数分かかる場合があります。",
              })}
      </p>
      <div className="mt-2 flex gap-2">
        <a href={KOFI_URL} target="_blank" rel="noreferrer">
          <Button type="button" variant="outline" size="sm">
            {tr(lang, { en: "Go to Ko-fi", es: "Ir a Ko-fi", ja: "Ko-fi へ" })}
          </Button>
        </a>
        {isGoldSupporter && (
          <a href="/analytics">
            <Button type="button" variant="outline" size="sm">
              {tr(lang, {
                en: "📊 View my analytics",
                es: "📊 Ver mi análisis",
                ja: "📊 自分の統計を見る",
              })}
            </Button>
          </a>
        )}
      </div>

      {isGoldSupporter && (
        <SettingsSaveForm
          action={updatePostMatchMessageAction}
          lang={lang}
          className="mt-4 flex flex-col gap-1.5 border-t border-border pt-4"
        >
          <label className="flex flex-col gap-1">
            <span className="font-medium text-foreground">
              {tr(lang, {
                en: "Post-match message",
                es: "Mensaje de fin de partida",
                ja: "試合後のメッセージ",
              })}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {tr(lang, {
                en: "Auto-posted in the match chat the moment a match of yours is confirmed. Leave blank to post nothing.",
                es: "Se publica automáticamente en el chat de la partida cuando esta se confirma. Déjalo vacío para no publicar nada.",
                ja: "自分の試合が確定した瞬間に、試合チャットへ自動投稿されます。空欄にすると何も投稿しません。",
              })}
            </span>
            <input
              name="postMatchMessage"
              type="text"
              maxLength={POST_MATCH_MESSAGE_MAX_LENGTH}
              defaultValue={postMatchMessage}
              placeholder={tr(lang, {
                en: "GG, good games!",
                es: "GG, ¡buenas partidas!",
                ja: "GG、ありがとうございました！",
              })}
              className="mt-1 h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
            />
          </label>
        </SettingsSaveForm>
      )}
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
      <p className="font-medium">
        {tr(lang, {
          en: "Stream overlay",
          es: "Overlay de stream",
          ja: "配信用オーバーレイ",
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        {trNode(lang, {
          en: (
            <>
              Use this URL as an OBS Browser Source (set to <strong>1920 x 1080</strong>) to show your rating, recent
              matches, and current match info on stream.
            </>
          ),
          es: (
            <>
              Usa esta URL como Browser Source en OBS (configurada a <strong>1920 x 1080</strong>) para mostrar tu
              clasificación, partidas recientes, y la partida actual en tu stream.
            </>
          ),
          ja: (
            <>
              この URL を OBS のブラウザソース（<strong>1920 x 1080</strong>
              に設定）として使うと、レート・最近の試合・現在の試合情報を配信に表示できます。
            </>
          ),
        })}
      </p>
      <div className="mt-3">
        <OverlayUrlToggle baseUrl={overlayUrl} lang={lang} />
      </div>
    </div>
  );
}

// Twitch liveness is detected; YouTube's cannot be on the free quota (see
// lib/stream-links.ts), so a player streaming there says so here. The same
// field takes a Twitch URL too — someone streaming from an account they
// haven't connected still gets to be listed.
function StreamLinksCard({
  liveStreamUrl,
  youtubeChannelUrl,
  lang,
}: {
  liveStreamUrl: string | null;
  youtubeChannelUrl: string | null;
  lang: Lang;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">{tr(lang, { en: "Stream links", es: "Enlaces de stream", ja: "配信リンク" })}</p>
      <SettingsSaveForm action={updateStreamLinksAction} lang={lang} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-medium text-foreground">
            {tr(lang, {
              en: "Streaming right now",
              es: "Transmitiendo ahora",
              ja: "いま配信中のURL",
            })}
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {tr(lang, {
              en: `Paste the URL of the stream you're running and your sets get listed as live for ${LIVE_DECLARATION_HOURS} hours. Twitch or YouTube. Clear it when you stop.`,
              es: `Pega la URL del stream que estés haciendo y tus partidas aparecerán como en vivo durante ${LIVE_DECLARATION_HOURS} horas. Twitch o YouTube. Bórralo cuando termines.`,
              ja: `配信中のURLを貼ると、${LIVE_DECLARATION_HOURS}時間のあいだ自分のセットが配信中として表示されます。Twitch と YouTube に対応しています。終わったら空にしてください。`,
            })}
          </span>
          <input
            name="liveStreamUrl"
            type="url"
            defaultValue={liveStreamUrl ?? ""}
            placeholder="https://www.youtube.com/watch?v=…"
            className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-foreground">
            {tr(lang, {
              en: "YouTube channel",
              es: "Canal de YouTube",
              ja: "YouTube チャンネル",
            })}
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {tr(lang, {
              en: "Shown on your profile, the same way a connected Twitch account is.",
              es: "Se muestra en tu perfil, igual que una cuenta de Twitch conectada.",
              ja: "連携済みの Twitch アカウントと同じように、プロフィールに表示されます。",
            })}
          </span>
          <input
            name="youtubeChannelUrl"
            type="url"
            defaultValue={youtubeChannelUrl ?? ""}
            placeholder="https://www.youtube.com/channel/UC…/live"
            className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
          />
        </label>
      </SettingsSaveForm>
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
      <p className="font-medium">
        {tr(lang, {
          en: "Twitch account",
          es: "Cuenta de Twitch",
          ja: "Twitch アカウント",
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        {tr(lang, {
          en: "Connect your Twitch account to access a custom stream overlay page. The overlay shows your rating, rank, and recent matches — perfect as an OBS Browser Source for your stream.",
          es: "Conecta tu cuenta de Twitch para acceder a una página de overlay personalizada. El overlay muestra tu clasificación, rango, y partidas recientes — perfecto como Browser Source de OBS para tu stream.",
          ja: "Twitch アカウントを連携すると、専用の配信オーバーレイページが使えます。レート・ランク・最近の試合が表示され、OBS のブラウザソースとしてそのまま配信に載せられます。",
        })}
      </p>
      {connected ? (
        <>
          {justConnected && (
            <p className="text-xs text-emerald-600">
              {tr(lang, {
                en: "Connected!",
                es: "¡Conectado!",
                ja: "連携済み！",
              })}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2">
            {connected.profileImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={connected.profileImageUrl} alt="" className="size-6 rounded-full" />
            )}
            <span className="font-medium">{connected.displayName ?? connected.username} ✓</span>
            <form action={disconnectTwitchAction}>
              <Button type="submit" size="sm" variant="outline">
                {tr(lang, {
                  en: "Disconnect",
                  es: "Desconectar",
                  ja: "連携を解除",
                })}
              </Button>
            </form>
          </div>
        </>
      ) : (
        <a href="/api/twitch/connect" className="mt-1 self-start">
          <Button type="button" size="sm">
            {tr(lang, {
              en: "Connect with Twitch",
              es: "Conectar con Twitch",
              ja: "Twitch と連携する",
            })}
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
      <p className="font-medium">
        {tr(lang, {
          en: "start.gg profile",
          es: "Perfil de start.gg",
          ja: "start.gg のプロフィール",
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        {tr(lang, {
          en: "Verified via start.gg sign-in, not a link you type in — so nobody else can claim your results as their own.",
          es: "Verificado mediante inicio de sesión de start.gg, no un enlace que escribes — así nadie más puede adjudicarse tus resultados.",
          ja: "start.gg でのログインによって確認されます。自分で入力するリンクではないため、他人があなたの戦績を自分のものとして登録することはできません。",
        })}
      </p>
      {connected ? (
        <>
          {justConnected && (
            <p className="text-xs text-emerald-600">
              {tr(lang, {
                en: "Connected!",
                es: "¡Conectado!",
                ja: "連携済み！",
              })}
            </p>
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
                {tr(lang, {
                  en: "Disconnect",
                  es: "Desconectar",
                  ja: "連携を解除",
                })}
              </Button>
            </form>
          </div>
        </>
      ) : (
        <a href="/api/startgg/connect" className="mt-1 self-start">
          <Button type="button" size="sm">
            {tr(lang, {
              en: "Connect with start.gg",
              es: "Conectar con start.gg",
              ja: "start.gg と連携する",
            })}
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
        {tr(lang, { en: "Settings", es: "Ajustes", ja: "設定" })}
      </h1>
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
