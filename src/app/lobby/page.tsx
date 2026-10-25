import Image from "next/image";
import Link from "next/link";
import {
  Check,
  Clock,
  Loader2,
  Lock,
  MapPin,
  NotebookPen,
  SlidersHorizontal,
  Swords,
  Users,
  ThumbsUp,
} from "lucide-react";
import { auth } from "@/auth";
import { getMatchupNote } from "@/lib/matchup-notes";
import { prisma } from "@/lib/db";
import {
  getActiveLobbyEntry,
  getLobbyActivityStats,
  retryPairForWaitingUser,
  touchWaitingLobbyEntry,
} from "@/lib/lobby";
import { PushNudgeBanner } from "@/components/push-nudge-banner";
import { SupporterBanner } from "@/components/supporter-banner";
import { getSupporterCount } from "@/lib/public-stats";
import { getAccountRestriction } from "@/lib/account";
import {
  CANCEL_GRACE_PERIOD_SECONDS,
  getRoomHostId,
  getUnresolvedMatchForUser,
  hasOpponentEngaged,
} from "@/lib/matches";
import { shouldPollLobby } from "@/lib/lobby-poll";
import { resolveQuickMessages } from "@/lib/quick-messages";
import { currentStreak, getHeadToHead, getPlayerMatchHistory, getTopCharacters } from "@/lib/players";
import {
  STRIKE_TIMEOUT_MS,
  REPORT_TIMEOUT_MS,
  bothCharactersLocked,
  characterPickState,
  getMatchGames,
  gameTurnState,
  lastPlayedStage,
  lastSameBans,
  lastUsedCharacter,
  lastUsedMoveset,
  secondsUntil,
} from "@/lib/match-games";
import { STRIKING_STAGES, stageImagePath, GAME_ONE_STAGES, COUNTERPICK_STAGES } from "@/lib/stages";
import { listMatchComments, isOpponentTyping } from "@/lib/match-comments";
import { referralLink } from "@/lib/referrals";
import { CopyButton } from "@/components/copy-button";
import { MATCH_DISTANCE_PRESETS, MATCH_REGION_GROUPS, REGION_REFERENCE_CITY } from "@/lib/regions";
import { MATCH_RATING_GAP_PRESETS, didTierUp, getRankTier, isRatingVisible } from "@/lib/rank-tier";
import { formatRating } from "@/lib/rating-format";
import { REMATCH_COOLDOWN_PRESETS } from "@/lib/rematch-cooldown";
import { effectiveArenaPassword } from "@/lib/arena";
import { SMASH_CHARACTERS } from "@/lib/characters";
import { cn } from "@/lib/utils";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CharacterIcon } from "@/components/character-icon";
import { CharacterPickForm } from "@/components/character-pick";
import { OptionSelect, type OptionSelectOption } from "@/components/option-select";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { RoomCodeForm } from "@/components/room-code-form";
import { QueueRoomCodeForm } from "@/components/queue-room-code-form";
import { FlashOnChange } from "@/components/flash-on-change";
import { Countdown } from "@/components/countdown";
import { QueueTimer } from "@/components/queue-timer";
import { LobbyPoller } from "@/components/lobby-poller";
import { type MatchFoundSound } from "@/lib/sound";
import { JoinLobbyForm } from "@/components/join-lobby-button";
import { QueueCooldownGate } from "@/components/queue-cooldown-gate";
import { CancelOrSurrenderButton } from "@/components/cancel-or-surrender-button";
import { SameBansButton } from "@/components/same-bans-button";
import { VictoryCelebration } from "@/components/victory-celebration";
import { RatingHidden } from "@/components/rating-hidden";
import { DisputeResolutionForm } from "@/components/dispute-resolution-form";
import { CommentForm } from "@/components/comment-form";
import { ChatMessages } from "@/components/chat-messages";
import { TypingIndicator } from "@/components/typing-indicator";
import { ReportConductForm } from "@/components/report-conduct-form";
import { MatchSettingsForm, type MatchSettingsState } from "@/components/match-settings-form";
import { getLang, type Lang } from "@/lib/i18n";
import {
  acceptStageProposal,
  beginFirstGame,
  cancelLobby,
  cancelMatchInProgress,
  declineStageProposal,
  joinLobby,
  leaveMatchAction,
  signalTypingAction,
  pickCharacter,
  pickStage,
  proposeStage,
  reportConductAction,
  reportConnection,
  reportGame,
  disputeGame,
  requestDisputeResolutionAction,
  requestMutualCancelAction,
  requestRematchAction,
  runItBack,
  sameBansStrike,
  sendMatchCommentAction,
  strikeStage,
  submitRoomCode,
  surrenderMatchAction,
  unstrikeStage,
  withdrawStageProposal,
  updateAvoidPracticeOpponents,
  updateLobbyRoomCodeAction,
  updateMaxMatchDistance,
  updateMaxRatingGap,
  updateRegion,
  updateRematchCooldown,
  updateRequireWiredOpponent,
  updateWiredConnection,
  updateZenMode,
} from "./actions";
import { tr, trNode } from "@/lib/lang";
import { USES_REGIONS, DISTANCE_MATCHMAKING } from "@/lib/site";

type Match = NonNullable<NonNullable<Awaited<ReturnType<typeof getActiveLobbyEntry>>>["match"]>;

export default async function LobbyPage() {
  const [session, activity, lang, supporterCount] = await Promise.all([
    auth(),
    getLobbyActivityStats(),
    getLang(),
    getSupporterCount(),
  ]);

  if (!session?.user?.id) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <PageHeading icon={Swords} title={tr(lang, { en: "Lobby", es: "Sala", ja: "ロビー" })} />
        <ActivityLine inMatch={activity.inMatch} matched={false} isWaiting={false} poll={false} lang={lang} />
        <p className="mt-2 text-sm text-muted-foreground">
          {tr(lang, {
            en: "Sign in with Discord (top right) to join the matchmaking lobby.",
            es: "Inicia sesión con Discord (arriba a la derecha) para unirte a la sala de emparejamiento.",
            ja: "右上の Discord でログインすると、マッチングロビーに参加できます。",
          })}
        </p>
      </main>
    );
  }

  // A banned player used to get the full lobby — queue button, live match,
  // report buttons — and only hit the wall when they pressed something, as an
  // opaque server-action error. Stop before any of that renders; the
  // site-wide AccountRestrictionBanner above already states why.
  const restriction = await getAccountRestriction(session.user.id);
  if (restriction?.status === "BANNED") {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <PageHeading icon={Swords} title={tr(lang, { en: "Lobby", es: "Sala", ja: "ロビー" })} />
        <p className="mt-2 text-sm text-muted-foreground">
          {tr(lang, {
            en: "Your account has been banned, so the lobby isn't available. See the notice above for details.",
            es: "Tu cuenta está suspendida permanentemente, así que la sala no está disponible. Mira el aviso de arriba para más detalles.",
            ja: "アカウントが利用停止のため、ロビーは使えません。詳細は上の通知を確認してください。",
          })}
        </p>
      </main>
    );
  }

  await retryPairForWaitingUser(session.user.id);
  const entry = await getActiveLobbyEntry(session.user.id);
  // This render is itself proof the player is still here (the poller refreshes
  // this page every ~5s while WAITING), so renew their queue spot — without
  // this, LOBBY_ENTRY_TTL_MS was a hard cap and an attentive player got dropped
  // mid-wait. Gated on actually waiting so an idle visitor pays nothing for it.
  if (entry?.status === "WAITING") await touchWaitingLobbyEntry(session.user.id);
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      region: true,
      queueCooldownUntil: true,
      audioPingOnMatch: true,
      matchFoundSound: true,
      // Only whether one exists, never the rows: this decides how often a
      // backgrounded wait re-renders the page (see lib/lobby-poll.ts), and
      // _count keeps it to a COUNT on the userId index.
      _count: { select: { pushSubscriptions: true } },
    },
  });
  // Region is required to queue (see joinLobbyAndTryPair), so the Lobby states
  // that up front and points at the settings card instead of letting the Find
  // Match button fail server-side with an error message.
  const hasRegion = !USES_REGIONS || Boolean(me?.region);
  const queueCooldownUntil = me?.queueCooldownUntil?.toISOString() ?? null;
  const hasPushSubscription = (me?._count.pushSubscriptions ?? 0) > 0;
  const audioPingOnMatch = me?.audioPingOnMatch ?? true;
  const matchFoundSound = me?.matchFoundSound ?? "CHIME";
  const isInActiveMatch =
    entry?.status === "PAIRED" &&
    entry.match &&
    entry.match.status !== "CONFIRMED" &&
    entry.match.status !== "CANCELLED" &&
    entry.match.status !== "EXPIRED";
  const matchJustEnded =
    entry?.status === "PAIRED" &&
    entry.match &&
    (entry.match.status === "CONFIRMED" || entry.match.status === "CANCELLED" || entry.match.status === "EXPIRED");
  const myLeftAt =
    matchJustEnded && entry?.match
      ? entry.match.player1Id === session.user.id
        ? entry.match.player1LeftAt
        : entry.match.player2LeftAt
      : null;

  // The match + chat panel renders during a live match or after one ends, and
  // stays open until the player dismisses it by clicking Leave — that panel
  // needs the wide 5xl container for its side-by-side chat column, while the
  // rest of the site uses the standard 3xl.
  const showMatchPanel = !myLeftAt && (isInActiveMatch || matchJustEnded);
  const isWaiting = entry?.status === "WAITING";
  // Rated ratings stay visible to moderators even while a player is provisional
  // (see isRatingVisible); the lobby's own match view is the one place a
  // non-mod player can be looking at another provisional player's number.
  const viewerIsModerator = session.user.role === "MOD" || session.user.role === "ADMIN";
  // The queue + settings stack only makes sense with no live match to focus on;
  // once a match ends it comes back below the results panel.
  const showQueueArea = !isInActiveMatch;

  return (
    <main className={`mx-auto w-full px-6 py-16 ${showMatchPanel ? "max-w-5xl" : "max-w-3xl"}`}>
      <PageHeading icon={Swords} title={tr(lang, { en: "Lobby", es: "Sala", ja: "ロビー" })} />
      <ActivityLine
        inMatch={activity.inMatch}
        matched={!!isInActiveMatch}
        isWaiting={isWaiting}
        poll={shouldPollLobby({
          isInActiveMatch: !!isInActiveMatch,
          isWaiting,
          matchJustEnded: !!matchJustEnded,
          hasLeftMatch: !!myLeftAt,
        })}
        hasPushSubscription={hasPushSubscription}
        audioPingOnMatch={audioPingOnMatch}
        matchFoundSound={matchFoundSound}
        lang={lang}
      />
      <PushNudgeBanner lang={lang} />

      {showMatchPanel && entry?.match && (
        <PairedView userId={session.user.id} match={entry.match} viewerIsModerator={viewerIsModerator} lang={lang} />
      )}

      {showQueueArea && (
        <>
          {/* One obvious place to start matchmaking, with the settings that
              shape the opponent pool in their own card right below it. */}
          {isWaiting ? (
            <Card className="mt-4 overflow-hidden border-primary/30">
              <CardHeader className="border-b border-border bg-primary/5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Loader2 className="size-4 animate-spin" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">
                      {tr(lang, {
                        en: "Searching for an opponent…",
                        es: "Buscando rival…",
                        ja: "対戦相手を探しています…",
                      })}
                    </CardTitle>
                    <CardDescription className="mt-0.5">
                      {tr(lang, {
                        en: "Turn on notifications in ",
                        es: "Activa las notificaciones en ",
                        ja: "マッチを見逃さないよう、",
                      })}
                      <Link
                        href="/settings?tab=notifications#push-notifications"
                        className="text-foreground underline underline-offset-2"
                      >
                        {tr(lang, {
                          en: "Settings",
                          es: "Ajustes",
                          ja: "設定",
                        })}
                      </Link>
                      {tr(lang, {
                        en: " so you don't miss the match.",
                        es: " para no perderte la partida.",
                        ja: "で通知をオンにしてください。",
                      })}
                    </CardDescription>
                  </div>
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="size-3.5" />
                    {tr(lang, { en: "In queue", es: "En cola", ja: "待機中" })}
                    <span className="font-medium tabular-nums text-foreground">
                      <QueueTimer joinedAt={entry.joinedAt.toISOString()} />
                    </span>
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <form action={cancelLobby}>
                  <Button type="submit" variant="outline">
                    {tr(lang, {
                      en: "Cancel search",
                      es: "Cancelar búsqueda",
                      ja: "待機をやめる",
                    })}
                  </Button>
                </form>
                <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
                  <QueueRoomCodeForm
                    initialValue={entry.existingRoomCode ?? ""}
                    action={updateLobbyRoomCodeAction}
                    lang={lang}
                  />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {tr(lang, {
                        en: "Wait feeling long? Invite a friend to get matched faster.",
                        es: "¿La espera se siente larga? Invita a un amigo para emparejarte más rápido.",
                        ja: "待ち時間が長いですか？友達を誘うと早くマッチします。",
                      })}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="max-w-full flex-1 truncate rounded-md border border-border bg-muted px-2 py-1 text-xs font-mono">
                        {referralLink(session.user.id)}
                      </code>
                      <CopyButton text={referralLink(session.user.id)} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="mt-4 overflow-hidden border-primary/30">
              <CardHeader className="border-b border-border bg-primary/5">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ThumbsUp className="size-4" />
                  </span>
                  <div>
                    <CardTitle className="text-base">
                      {matchJustEnded
                        ? tr(lang, {
                            en: "Ready for another match?",
                            es: "¿Listo para otra partida?",
                            ja: "もう一戦やりますか？",
                          })
                        : tr(lang, {
                            en: "Ready to play?",
                            es: "¿Listo para jugar?",
                            ja: "対戦しますか？",
                          })}
                    </CardTitle>
                    <CardDescription className="mt-0.5">
                      {tr(lang, {
                        en: DISTANCE_MATCHMAKING
                          ? "Join the queue and we'll pair you with a nearby opponent."
                          : "Join the queue and we'll pair you with an opponent.",
                        es: DISTANCE_MATCHMAKING
                          ? "Entra en la cola y te emparejaremos con un rival cercano."
                          : "Entra en la cola y te emparejaremos con un rival.",
                        ja: DISTANCE_MATCHMAKING
                          ? "待機すると、近くの相手とマッチングします。"
                          : "待機すると、対戦相手とマッチングします。",
                      })}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {!hasRegion && (
                  <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-muted-foreground">
                      {trNode(lang, {
                        en: (
                          <>
                            Choose your <span className="font-medium text-foreground">match region</span> in the
                            settings below to start matching.{" "}
                            <a
                              href="#match-settings"
                              className="font-medium text-foreground underline underline-offset-2"
                            >
                              Set region ↓
                            </a>
                          </>
                        ),
                        es: (
                          <>
                            Elige tu <span className="font-medium text-foreground">región de partida</span> en los
                            ajustes de abajo para poder buscar partida.{" "}
                            <a
                              href="#match-settings"
                              className="font-medium text-foreground underline underline-offset-2"
                            >
                              Elegir región ↓
                            </a>
                          </>
                        ),
                        ja: (
                          <>
                            下の設定で
                            <span className="font-medium text-foreground">対戦地域</span>
                            を選ぶと、対戦相手を探せます。{" "}
                            <a
                              href="#match-settings"
                              className="font-medium text-foreground underline underline-offset-2"
                            >
                              地域を設定する ↓
                            </a>
                          </>
                        ),
                      })}
                    </p>
                  </div>
                )}
                <QueueCooldownGate cooldownUntil={queueCooldownUntil} lang={lang}>
                  <JoinLobbyForm action={joinLobby} lang={lang} hasRegion={hasRegion} />
                </QueueCooldownGate>
              </CardContent>
            </Card>
          )}

          <Card id="match-settings" className="mt-4 scroll-mt-24">
            <CardHeader className="border-b border-border">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <SlidersHorizontal className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base">
                    {tr(lang, {
                      en: "Match settings",
                      es: "Ajustes de partida",
                      ja: "対戦設定",
                    })}
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    {tr(lang, {
                      en: "Who you match with, and how.",
                      es: "Con quién te emparejamos y cómo.",
                      ja: "誰と、どのようにマッチするか。",
                    })}
                  </CardDescription>
                </div>
                {isWaiting && (
                  <Badge variant="outline" className="shrink-0">
                    <Lock className="size-3" />
                    {tr(lang, {
                      en: "Locked",
                      es: "Bloqueados",
                      ja: "変更不可",
                    })}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <MatchmakingForm userId={session.user.id} lang={lang} disabled={isWaiting} />
            </CardContent>
          </Card>
        </>
      )}

      <SupporterBanner supporterCount={supporterCount} lang={lang} />
    </main>
  );
}

function ActivityLine({
  inMatch,
  matched,
  isWaiting,
  poll,
  hasPushSubscription = false,
  audioPingOnMatch = true,
  matchFoundSound = "CHIME",
  lang,
}: {
  inMatch: number;
  matched: boolean;
  isWaiting: boolean;
  poll: boolean;
  hasPushSubscription?: boolean;
  audioPingOnMatch?: boolean;
  matchFoundSound?: MatchFoundSound;
  lang: Lang;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
      <Users className="size-3.5" />
      <span className="tabular-nums">
        {trNode(lang, {
          en: (
            <>
              <span className="font-medium text-foreground">{inMatch}</span> playing now
            </>
          ),
          es: (
            <>
              <span className="font-medium text-foreground">{inMatch}</span> jugando ahora
            </>
          ),
          ja: (
            <>
              <span className="font-medium text-foreground">{inMatch}</span> 人が対戦中
            </>
          ),
        })}
      </span>
      {poll && (
        <LobbyPoller
          matched={matched}
          keepPollingInBackground={isWaiting}
          hasPushSubscription={hasPushSubscription}
          audioPingOnMatch={audioPingOnMatch}
          matchFoundSound={matchFoundSound}
        />
      )}
    </div>
  );
}

const WORLDWIDE_VALUE = "worldwide";
const ANY_RATING_VALUE = "any";
const ANYTIME_VALUE = "anytime";

const REGION_OPTIONS: OptionSelectOption[] = MATCH_REGION_GROUPS.flatMap((group) =>
  group.regions.map((r) => ({
    value: r,
    label: REGION_REFERENCE_CITY[r] ? `${r} (${REGION_REFERENCE_CITY[r]})` : r,
    group: group.label,
  })),
);

async function MatchmakingForm({ userId, lang, disabled = false }: { userId: string; lang: Lang; disabled?: boolean }) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      region: true,
      maxMatchDistanceKm: true,
      maxRatingGap: true,
      rematchCooldownHours: true,
      wiredConnection: true,
      requireWiredOpponent: true,
      avoidPracticeOpponents: true,
      zenMode: true,
    },
  });

  // Wired can be refused (too many cancels), so it goes last and can't strand the others
  async function action(_prevState: MatchSettingsState, formData: FormData): Promise<MatchSettingsState> {
    "use server";
    try {
      if (USES_REGIONS) await updateRegion(String(formData.get("region") ?? ""));
      if (DISTANCE_MATCHMAKING) {
        const distance = String(formData.get("maxMatchDistanceKm") ?? "");
        await updateMaxMatchDistance(distance === WORLDWIDE_VALUE ? null : Number(distance));
      }
      const ratingGap = String(formData.get("maxRatingGap") ?? "");
      await updateMaxRatingGap(ratingGap === ANY_RATING_VALUE ? null : Number(ratingGap));
      const rematchCooldown = String(formData.get("rematchCooldownHours") ?? "");
      await updateRematchCooldown(rematchCooldown === ANYTIME_VALUE ? null : Number(rematchCooldown));
      await updateRequireWiredOpponent(formData.get("requireWiredOpponent") === "on");
      await updateAvoidPracticeOpponents(formData.get("avoidPracticeOpponents") === "on");
      await updateZenMode(formData.get("zenMode") === "on");
      await updateWiredConnection(formData.get("wired") === "on");
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Something went wrong — try again.",
        saved: false,
      };
    }
    return { error: null, saved: true };
  }

  const missingRegion = DISTANCE_MATCHMAKING && !me?.region;

  return (
    <MatchSettingsForm action={action} className="flex flex-col gap-6" lang={lang} disabled={disabled}>
      {disabled && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {tr(lang, {
            en: "You're in the queue, so these settings are locked — cancel your search to change them.",
            es: "Estás en la cola, así que estos ajustes están bloqueados — cancela la búsqueda para cambiarlos.",
            ja: "待機中は設定を変更できません。変えるには待機をやめてください。",
          })}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {USES_REGIONS && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span className="flex items-center gap-1.5">
              {tr(lang, {
                en: "Match region",
                es: "Región de partida",
                ja: "対戦地域",
              })}
              {missingRegion && (
                <Badge variant="warning">{tr(lang, { en: "Required", es: "Requerido", ja: "必須" })}</Badge>
              )}
            </span>
            <OptionSelect
              key={me?.region ?? ""}
              name="region"
              defaultValue={me?.region ?? ""}
              placeholder={tr(lang, {
                en: "Not set",
                es: "Sin definir",
                ja: "未設定",
              })}
              clearLabel={tr(lang, {
                en: "Not set",
                es: "Sin definir",
                ja: "未設定",
              })}
              className="w-full"
              searchable
              autoSubmit
              searchPlaceholder={tr(lang, {
                en: "Search regions…",
                es: "Buscar regiones…",
                ja: "地域を検索…",
              })}
              disabled={disabled}
              options={REGION_OPTIONS}
            />
          </label>
        )}

        {DISTANCE_MATCHMAKING && (
          <MatchSettingSelect
            name="maxMatchDistanceKm"
            label={tr(lang, {
              en: "Match distance",
              es: "Distancia de partida",
              ja: "対戦距離",
            })}
            defaultValue={String(me?.maxMatchDistanceKm ?? WORLDWIDE_VALUE)}
            resetKey={String(me?.maxMatchDistanceKm ?? WORLDWIDE_VALUE)}
            disabled={disabled}
            options={MATCH_DISTANCE_PRESETS.map((preset) => ({
              value: String(preset.km ?? WORLDWIDE_VALUE),
              label: preset.label,
            }))}
          />
        )}

        <MatchSettingSelect
          name="maxRatingGap"
          label={tr(lang, {
            en: "Rating gap",
            es: "Diferencia de clasificación",
            ja: "レート差",
          })}
          defaultValue={String(me?.maxRatingGap ?? ANY_RATING_VALUE)}
          resetKey={String(me?.maxRatingGap ?? ANY_RATING_VALUE)}
          disabled={disabled}
          options={MATCH_RATING_GAP_PRESETS.map((preset) => ({
            value: String(preset.gap ?? ANY_RATING_VALUE),
            label: preset.label[lang],
          }))}
        />

        <MatchSettingSelect
          name="rematchCooldownHours"
          label={tr(lang, {
            en: "Rematch cooldown",
            es: "Espera de revancha",
            ja: "再戦の間隔",
          })}
          defaultValue={String(me?.rematchCooldownHours ?? ANYTIME_VALUE)}
          resetKey={String(me?.rematchCooldownHours ?? ANYTIME_VALUE)}
          disabled={disabled}
          options={REMATCH_COOLDOWN_PRESETS.map((preset) => ({
            value: String(preset.hours ?? ANYTIME_VALUE),
            label: preset.label[lang],
          }))}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-border p-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
            <input
              key={String(me?.wiredConnection ?? false)}
              type="checkbox"
              name="wired"
              defaultChecked={me?.wiredConnection ?? false}
              disabled={disabled}
              className="size-4 rounded border-border disabled:opacity-60"
            />
            {tr(lang, {
              en: "On a wired (LAN) connection",
              es: "En una conexión por cable (LAN)",
              ja: "有線（LAN）接続",
            })}
          </label>
          {/* Kept outside the label so clicking the link doesn't toggle the box. */}
          <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
            {trNode(lang, {
              en: (
                <>
                  Auto-clears if your cancels pass 25% of cancels plus games played, or if enough opponents report a
                  connection issue with you — see the{" "}
                  <Link href="/rules" className="text-foreground underline underline-offset-2">
                    Rules
                  </Link>
                  .
                </>
              ),
              es: (
                <>
                  Se desactiva solo si tus cancelaciones superan el 25% de tus cancelaciones más partidas jugadas, o si
                  suficientes rivales reportan un problema de conexión contigo — consulta las{" "}
                  <Link href="/rules" className="text-foreground underline underline-offset-2">
                    Reglas
                  </Link>
                  .
                </>
              ),
              ja: (
                <>
                  キャンセル数が「キャンセル＋試合数」の25%を超えた場合、または十分な数の相手から回線の問題を報告された場合に自動で解除されます。詳しくは
                  <Link href="/rules" className="text-foreground underline underline-offset-2">
                    ルール
                  </Link>
                  をご覧ください。
                </>
              ),
            })}
          </p>
        </div>

        <MatchSettingToggle
          name="requireWiredOpponent"
          checked={me?.requireWiredOpponent ?? false}
          label={tr(lang, {
            en: "Only match with wired opponents",
            es: "Solo rivales por cable",
            ja: "有線接続の相手のみとマッチする",
          })}
          disabled={disabled}
        />
        <MatchSettingToggle
          name="avoidPracticeOpponents"
          checked={me?.avoidPracticeOpponents ?? false}
          label={tr(lang, {
            en: "Don't match me with opponents who are practicing",
            es: "Evitar rivales que están practicando",
            ja: "練習中の相手とはマッチしない",
          })}
          disabled={disabled}
        />
        <MatchSettingToggle
          name="zenMode"
          checked={me?.zenMode ?? false}
          label={tr(lang, { en: "Zen Mode", es: "Modo Zen", ja: "ゼンモード" })}
          hint={tr(lang, {
            en: "Hide both ratings while you're in a match.",
            es: "Oculta ambas clasificaciones mientras estás en una partida.",
            ja: "対戦中、お互いのレートを隠します。",
          })}
          disabled={disabled}
        />
      </div>
    </MatchSettingsForm>
  );
}

// Label + preset dropdown, the shape every numeric match setting shares.
// `resetKey` is passed straight through to OptionSelect's key so a fresh
// server value remounts the picker.
function MatchSettingSelect({
  name,
  label,
  defaultValue,
  resetKey,
  disabled,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  resetKey: string;
  disabled: boolean;
  options: OptionSelectOption[];
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <OptionSelect
        key={resetKey}
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="w-full"
        autoSubmit
        options={options}
      />
    </label>
  );
}

// Checkbox row with an optional second line of explanation.
function MatchSettingToggle({
  name,
  checked,
  label,
  hint,
  disabled,
}: {
  name: string;
  checked: boolean;
  label: string;
  hint?: string;
  disabled: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-sm">
      <input
        key={String(checked)}
        type="checkbox"
        name={name}
        defaultChecked={checked}
        disabled={disabled}
        className="mt-0.5 size-4 rounded border-border disabled:opacity-60"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

// Once a match is over, its full detail (room code, dispute history,
// opponent card) has nothing left to act on and just sits on the Lobby
// page as clutter — that's what the player's own match history on their
// profile is for. But comments are kept open by default so both players
// can keep talking; either can end their own view of it via Leave.
async function PairedView({
  userId,
  match,
  viewerIsModerator,
  lang,
}: {
  userId: string;
  match: Match;
  viewerIsModerator: boolean;
  lang: Lang;
}) {
  const opponent = match.player1Id === userId ? match.player2 : match.player1;
  const isPlayer1 = match.player1Id === userId;
  const alreadyReportedConnection = match.connectionReports.length > 0;
  const myLeftAt = isPlayer1 ? match.player1LeftAt : match.player2LeftAt;
  const opponentLeftAt = isPlayer1 ? match.player2LeftAt : match.player1LeftAt;
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      avatarUrl: true,
      zenMode: true,
      rating: true,
      gamesPlayed: true,
      practiceRating: true,
      practiceGamesPlayed: true,
      region: true,
    },
  });
  const zenMode = me?.zenMode ?? false;
  const displayName = opponent.username;
  // Doesn't hide the opponent's own rating from them (that's what zenMode
  // above does, one-directionally) — just lets them know you have it on, so
  // they're not confused if you don't talk rating.
  const opponentInZenMode = opponent.zenMode;
  const opponentIsPracticing = isPlayer1 ? match.player2IsPracticing : match.player1IsPracticing;
  const myIsPracticing = isPlayer1 ? match.player1IsPracticing : match.player2IsPracticing;

  if (match.status === "CONFIRMED" || match.status === "CANCELLED" || match.status === "EXPIRED") {
    // Opponent may have queued into (and already be playing) a new match since
    // this one ended — a stale rematch request would otherwise just sit there
    // showing "Waiting…" forever, since requestRematch silently no-ops in that
    // case (see the eitherAlreadyPlaying check in lib/matches.ts).
    const opponentUnavailable = !myLeftAt && !opponentLeftAt ? !!(await getUnresolvedMatchForUser(opponent.id)) : false;
    const chat = (
      <CommentsSection
        userId={userId}
        match={match}
        opponentName={displayName}
        opponentHasLeft={!!opponentLeftAt}
        lang={lang}
      />
    );
    return (
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          {match.status === "CONFIRMED" ? (
            <ConfirmedSection userId={userId} match={match} viewerIsModerator={viewerIsModerator} lang={lang} />
          ) : (
            <TerminatedSection status={match.status} lang={lang} />
          )}
          {!myLeftAt && (
            <CardContent className="flex items-center gap-3 border-t border-border pt-4">
              <RematchSection
                matchId={match.id}
                opponentName={displayName}
                myRequestedAt={isPlayer1 ? match.player1RematchRequestedAt : match.player2RematchRequestedAt}
                opponentRequestedAt={isPlayer1 ? match.player2RematchRequestedAt : match.player1RematchRequestedAt}
                opponentLeftAt={opponentLeftAt}
                opponentUnavailable={opponentUnavailable}
                lang={lang}
              />
              <form action={leaveMatchAction.bind(null, match.id)} className="ml-auto">
                <Button type="submit" variant="outline" size="sm">
                  {tr(lang, { en: "Leave", es: "Salir", ja: "退出" })}
                </Button>
              </form>
            </CardContent>
          )}
          <CardContent className="border-t border-border pt-4">
            <Link
              href={`/players/${userId}`}
              prefetch={false}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {tr(lang, {
                en: "View full match details on your profile →",
                es: "Ver todos los detalles de la partida en tu perfil →",
                ja: "プロフィールで試合の詳細を見る →",
              })}
            </Link>
          </CardContent>
        </Card>
        <div>{chat}</div>
      </div>
    );
  }

  const games = await getMatchGames(match.id);
  const topCharacters = await getTopCharacters(opponent.id);
  // Filtered to the live roster so a stale historical name (e.g. recorded
  // before a character rename) can't become a quick-pick button that fails
  // validation in pickGameCharacter.
  const myTopCharacters = (await getTopCharacters(userId, 3)).filter((c) =>
    (SMASH_CHARACTERS as readonly string[]).includes(c),
  );
  const opponentStreak = currentStreak(await getPlayerMatchHistory(opponent.id));
  // Lifetime record vs this specific opponent (confirmed, non-practice sets
  // only).
  const headToHead = await getHeadToHead(userId, opponent.id);
  // Once any game's been decided or reported, cancelMatch is blocked
  // outright (see its gameInProgress check) — surrenderMatch isn't, so the
  // button always means "surrender" from that point on, no need to spend a
  // query re-checking opponent engagement.
  const gameDecided = games.some((g) => g.winnerId !== null || g.reportedById !== null);
  const opponentEngaged = gameDecided ? true : await hasOpponentEngaged(match.id, opponent.id);

  const chat = (
    <CommentsSection
      userId={userId}
      match={match}
      opponentName={displayName}
      opponentHasLeft={!!opponentLeftAt}
      lang={lang}
    />
  );

  // Re-derived on every poll, like the rest of the match state below, so the
  // top-of-card banner always reflects the current turn/deadline.
  const matchAction = matchActionSummary(userId, match, games);

  return (
    <div className="mt-4 flex flex-col gap-4">
      <MatchScoreboard
        games={games}
        userId={userId}
        opponentName={displayName}
        lang={lang}
        me={me}
        myIsPracticing={myIsPracticing}
        opponent={opponent}
        viewerIsModerator={viewerIsModerator}
        opponentStreak={opponentStreak}
        opponentInZenMode={opponentInZenMode}
        opponentIsPracticing={opponentIsPracticing}
        zenMode={zenMode}
        headToHead={headToHead}
        topCharacters={topCharacters}
        myTopCharacters={myTopCharacters}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="pt-4">
            <MatchActionBanner summary={matchAction} opponentName={displayName} lang={lang} />
          </CardContent>

          {(match.status === "PENDING_REPORT" || match.status === "REPORTED") && (
            <GameSection
              userId={userId}
              match={match}
              games={games}
              opponentName={displayName}
              myTopCharacters={myTopCharacters}
              lang={lang}
            />
          )}

          {games.filter(isDisputedGame).map((g) => {
            if (g.disputeRequestedAt) {
              return (
                <CardContent key={g.id} className="border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">
                    {tr(lang, {
                      en: `⚠️ Game ${g.gameNumber} is disputed and awaiting mod review. The set can continue.`,
                      es: `⚠️ El juego ${g.gameNumber} está en disputa y espera revisión de un mod. La partida puede continuar.`,
                      ja: `⚠️ 第${g.gameNumber}試合は異議申立中で、モデレーターの確認待ちです。セットは続行できます。`,
                    })}
                  </p>
                  <DisputeResolutionForm
                    action={requestDisputeResolutionAction.bind(null, match.id, g.gameNumber)}
                    myId={userId}
                    opponentId={opponent.id}
                    opponentUsername={displayName}
                    lang={lang}
                  />
                </CardContent>
              );
            }

            const myConfirmed = g.reportedById === userId ? g.reporterConfirmedAt : g.secondReporterConfirmedAt;
            const oppConfirmed = g.reportedById === userId ? g.secondReporterConfirmedAt : g.reporterConfirmedAt;
            const body = (
              <>
                <p className="text-sm text-muted-foreground">
                  {tr(lang, {
                    en: `⚠️ You and ${displayName} reported different results for Game ${g.gameNumber}. Re-report to confirm, or dispute it for a mod to review.`,
                    es: `⚠️ Tú y ${displayName} reportaron resultados distintos en el juego ${g.gameNumber}. Vuelve a reportar para confirmar, o disputa para que un mod lo revise.`,
                    ja: `⚠️ 第${g.gameNumber}試合について、あなたと${displayName}の報告が食い違っています。もう一度報告して確定するか、異議を出してモデレーターに確認してもらってください。`,
                  })}
                </p>
                <div className="mt-2 flex gap-2">
                  <ConfirmSubmitButton
                    action={reportGame.bind(null, match.id, g.gameNumber, true)}
                    confirmMessage={tr(lang, {
                      en: `Confirm that you won game ${g.gameNumber}?`,
                      es: `¿Confirmar que ganaste el juego ${g.gameNumber}?`,
                      ja: `第${g.gameNumber}試合に勝ったとして確定しますか？`,
                    })}
                    variant="success"
                    lang={lang}
                  >
                    {tr(lang, { en: "I Won", es: "Gané", ja: "勝った" })}
                  </ConfirmSubmitButton>
                  <ConfirmSubmitButton
                    action={reportGame.bind(null, match.id, g.gameNumber, false)}
                    confirmMessage={tr(lang, {
                      en: `Confirm that you lost game ${g.gameNumber}?`,
                      es: `¿Confirmar que perdiste el juego ${g.gameNumber}?`,
                      ja: `第${g.gameNumber}試合に負けたとして確定しますか？`,
                    })}
                    variant="destructive"
                    lang={lang}
                  >
                    {tr(lang, { en: "I Lost", es: "Perdí", ja: "負けた" })}
                  </ConfirmSubmitButton>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {(() => {
                    if (myConfirmed && oppConfirmed) {
                      return tr(lang, {
                        en: "You both confirmed. A mod will review this game.",
                        es: "Ambos confirmaron. Un mod revisará este juego.",
                        ja: "両者が確定しました。この試合はモデレーターが確認します。",
                      });
                    }
                    if (myConfirmed) {
                      return tr(lang, {
                        en: `You confirmed. Waiting for ${displayName}.`,
                        es: `Confirmaste. Esperando a ${displayName}.`,
                        ja: `あなたは確定しました。${displayName}を待っています。`,
                      });
                    }
                    if (oppConfirmed) {
                      return tr(lang, {
                        en: `${displayName} confirmed. Confirm yours to finish.`,
                        es: `${displayName} confirmó. Confirma el tuyo para terminar.`,
                        ja: `${displayName}が確定しました。あなたも確定すると終了します。`,
                      });
                    }
                    return tr(lang, {
                      en: "Reporting the opposite result gives your opponent the game.",
                      es: "Reportar el resultado opuesto le da el juego a tu rival.",
                      ja: "逆の結果を報告すると、この試合は相手の勝ちになります。",
                    });
                  })()}
                </p>
                <form action={disputeGame.bind(null, match.id, g.gameNumber)} className="mt-2">
                  <Button type="submit" variant="outline" size="sm">
                    {tr(lang, {
                      en: "Dispute this game",
                      es: "Disputar este juego",
                      ja: "この試合に異議を出す",
                    })}
                  </Button>
                </form>
              </>
            );
            return (
              <CardContent key={g.id} className={cn("border-t border-border pt-4", !myConfirmed && INPUT_FOCUS)}>
                {body}
              </CardContent>
            );
          })}

          {match.status === "DISPUTED" && (
            <CardContent className="border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                {tr(lang, {
                  en: `You and ${displayName} reported different results. A mod will review this match.`,
                  es: `Tú y ${displayName} reportaron resultados distintos. Un mod revisará esta partida.`,
                  ja: `あなたと${displayName}の報告が食い違っています。この試合はモデレーターが確認します。`,
                })}
              </p>
            </CardContent>
          )}

          {/* Desktop: the surrender/cancel/report actions sit at the bottom of
              the set card (hidden below lg, where they get their own card). */}
          {(match.status === "PENDING_REPORT" || match.status === "REPORTED") && (
            <CardContent className="hidden flex-col gap-3 border-t border-border pt-4 lg:flex">
              <MatchFooterActions
                match={match}
                isPlayer1={isPlayer1}
                opponentName={displayName}
                opponentEngaged={opponentEngaged}
                gameDecided={gameDecided}
                alreadyReportedConnection={alreadyReportedConnection}
                lang={lang}
              />
            </CardContent>
          )}
        </Card>

        <div className="flex min-h-0 flex-col gap-4">
          {/* Arena card — room code + host/password info, above the chat panel */}
          <Card>
            <CardContent className="pt-4">
              <RoomCodeSection
                matchId={match.id}
                initialValue={match.roomCode ?? ""}
                isHost={getRoomHostId(match) === userId}
                opponentName={displayName}
                myArenaPassword={effectiveArenaPassword(match.player1Id === userId ? match.player1 : match.player2)}
                opponentArenaPassword={effectiveArenaPassword(opponent)}
                lang={lang}
              />
            </CardContent>
          </Card>

          {/* Chat card — side panel on desktop, below on mobile */}
          <div className="flex min-h-0 flex-1 flex-col">{chat}</div>
        </div>
      </div>

      {/* Mobile: the same actions get their own card below the chat, since the
          sidebar stacks under the set card here. Desktop keeps them inside the
          set card, so this copy is hidden from lg up. */}
      {(match.status === "PENDING_REPORT" || match.status === "REPORTED") && (
        <Card className="lg:hidden">
          <CardContent className="flex flex-col gap-3 pt-4">
            <MatchFooterActions
              match={match}
              isPlayer1={isPlayer1}
              opponentName={displayName}
              opponentEngaged={opponentEngaged}
              gameDecided={gameDecided}
              alreadyReportedConnection={alreadyReportedConnection}
              lang={lang}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MatchFooterActions({
  match,
  isPlayer1,
  opponentName,
  opponentEngaged,
  gameDecided,
  alreadyReportedConnection,
  lang,
}: {
  match: Match;
  isPlayer1: boolean;
  opponentName: string;
  opponentEngaged: boolean;
  gameDecided: boolean;
  alreadyReportedConnection: boolean;
  lang: Lang;
}) {
  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {gameDecided
            ? tr(lang, {
                en: "A game is already decided, so leaving now counts as a surrender (a loss). If your opponent goes quiet, you don't need to surrender: they forfeit their turn after a few minutes; a stalled pick costs them the whole set on game 1, and from game 2 onwards just falls back to the character and stage from the previous game.",
                es: "Ya se decidió un juego, así que salir ahora cuenta como rendición (una derrota). Si tu rival deja de responder, no necesitas rendirte: pierde su turno por abandono tras unos minutos; una elección estancada le cuesta el set completo en el juego 1, y del juego 2 en adelante solo vuelve al personaje y escenario del juego anterior.",
                ja: "すでに1試合の結果が出ているため、ここで退出すると降参（敗北）として扱われます。相手が応答しなくなった場合、降参する必要はありません。数分で相手が手番を失います。第1試合で選択が止まった場合は相手のセット負け、第2試合以降は前の試合のキャラとステージがそのまま使われます。",
              })
            : opponentEngaged
              ? tr(lang, {
                  en: "Your opponent already started this match, so leaving now counts as a surrender (a loss), not a free cancel.",
                  es: "Tu rival ya empezó esta partida, así que salir ahora cuenta como rendición (una derrota), no como cancelación gratis.",
                  ja: "相手はすでにこの試合を開始しています。ここで退出すると無償のキャンセルではなく、降参（敗北）になります。",
                })
              : tr(lang, {
                  en: "Your opponent hasn't shown up yet. Cancelling now is free.",
                  es: "Tu rival aún no se presenta. Cancelar ahora es gratis.",
                  ja: "相手はまだ来ていません。今ならキャンセルしても不利になりません。",
                })}
        </p>
        {(match.status === "PENDING_REPORT" || match.status === "REPORTED") && (
          <CancelOrSurrenderButton
            mode={opponentEngaged ? "surrender" : "cancel"}
            action={
              opponentEngaged ? surrenderMatchAction.bind(null, match.id) : cancelMatchInProgress.bind(null, match.id)
            }
            cancelReadyAt={new Date(match.createdAt.getTime() + CANCEL_GRACE_PERIOD_SECONDS * 1000).toISOString()}
            lang={lang}
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {tr(lang, {
            en: "Can't finish? Both players can agree to cancel. No rating impact.",
            es: "¿No pueden terminar? Ambos pueden acordar cancelar. Sin afectar la clasificación.",
            ja: "続けられませんか？両者が合意すれば中止できます。レートには影響しません。",
          })}
        </p>
        <MutualCancelSection
          matchId={match.id}
          myRequestedAt={isPlayer1 ? match.player1CancelRequestedAt : match.player2CancelRequestedAt}
          opponentRequestedAt={isPlayer1 ? match.player2CancelRequestedAt : match.player1CancelRequestedAt}
          opponentName={opponentName}
          lang={lang}
        />
      </div>
      <ReportConductForm action={reportConductAction.bind(null, match.id)} lang={lang} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {tr(lang, {
            en: "Lag or disconnects?",
            es: "¿Lag o desconexiones?",
            ja: "ラグや切断がありましたか？",
          })}
        </p>
        {alreadyReportedConnection ? (
          <Button size="sm" variant="outline" disabled className="gap-1.5">
            <Check className="h-3.5 w-3.5" />
            {tr(lang, {
              en: "Connection reported",
              es: "Conexión reportada",
              ja: "回線を報告しました",
            })}
          </Button>
        ) : (
          <form action={reportConnection.bind(null, match.id)}>
            <Button type="submit" size="sm" variant="outline">
              {tr(lang, {
                en: "Report connection",
                es: "Reportar conexión",
                ja: "回線を報告",
              })}
            </Button>
          </form>
        )}
      </div>
    </>
  );
}

function isDisputedGame(game: {
  winnerId: string | null;
  reportedWinnerId: string | null;
  secondReportWinnerId: string | null;
}) {
  return !game.winnerId && !!game.secondReportWinnerId && game.secondReportWinnerId !== game.reportedWinnerId;
}

// Number of game pips in the scoreboard row — the set is always best-of-5.
const SET_GAME_COUNT = 5;

type MatchGameRow = Awaited<ReturnType<typeof getMatchGames>>[number];

// Discriminated summary of the single most important next step in a live
// set, derived from the same state the action sections below render (so the
// banner restates the situation instead of drifting from what those sections
// actually offer). Kept as data so the banner renderer owns all the copy.
type MatchActionSummary =
  | { kind: "start-game"; gameNumber: number }
  | {
      kind: "pick-character";
      gameNumber: number;
      mine: boolean;
      deadlineIso: string | null;
    }
  | {
      kind: "stage";
      gameNumber: number;
      phase: "striking" | "picking";
      mine: boolean;
      strikeCount: number;
      deadlineIso: string;
    }
  | {
      kind: "report-game";
      gameNumber: number;
      mine: boolean;
      deadlineIso: string | null;
    }
  | { kind: "contest"; gameNumber: number; escalated: boolean }
  | { kind: "match-disputed" }
  | { kind: "waiting" };

function matchActionSummary(userId: string, match: Match, games: MatchGameRow[]): MatchActionSummary {
  // A match-level dispute (an escalated game, or a legacy row) has no
  // playable next step — everyone is waiting on a mod.
  if (match.status === "DISPUTED") return { kind: "match-disputed" };

  // The playable game in flight — a disputed/contested game is skipped here
  // (it doesn't block the rest of the set), mirroring GameSection.
  const current = games.find((g) => !g.winnerId && !isDisputedGame(g));

  if (!current) {
    const lastGame = games[games.length - 1];
    if (games.length > 0 && lastGame && isDisputedGame(lastGame)) {
      return {
        kind: "contest",
        gameNumber: lastGame.gameNumber,
        escalated: !!lastGame.disputeRequestedAt,
      };
    }
    return { kind: "start-game", gameNumber: games.length + 1 };
  }

  const gameNumber = current.gameNumber;

  if (!bothCharactersLocked(current)) {
    const pick = characterPickState(current, userId);
    if (pick.yourCharacter) {
      // Locked in yourself — the pick clock now belongs to the opponent. On
      // game 1 that's the same shared window you both started on; on games
      // 2+ it restarted when you locked in (see pickGameCharacter).
      return {
        kind: "pick-character",
        gameNumber,
        mine: false,
        deadlineIso: current.characterPickDeadline.toISOString(),
      };
    }
    if (pick.canPickNow) {
      return {
        kind: "pick-character",
        gameNumber,
        mine: true,
        deadlineIso: current.characterPickDeadline.toISOString(),
      };
    }
    // Games 2+: the previous game's winner (actor A) must lock in before you
    // can pick. This pre-lock window isn't a per-player clock — nothing
    // auto-resolves while neither side has locked in — so no countdown.
    return {
      kind: "pick-character",
      gameNumber,
      mine: false,
      deadlineIso: null,
    };
  }

  const turn = gameTurnState(current);

  if (turn.phase === "done") {
    // The report clock only starts once someone has actually reported (see
    // ReportGameSection) — anchored on reportedAt, not on when the stage was
    // picked.
    const mine = current.reportedById !== userId;
    const deadlineIso = current.reportedAt
      ? new Date(current.reportedAt.getTime() + REPORT_TIMEOUT_MS).toISOString()
      : null;
    return { kind: "report-game", gameNumber, mine, deadlineIso };
  }

  const struckSoFar = current.struckStages.length;
  return {
    kind: "stage",
    gameNumber,
    phase: turn.phase,
    mine: turn.actorId === userId,
    strikeCount:
      turn.phase === "striking"
        ? struckSoFar < current.actorAStrikes
          ? current.actorAStrikes - struckSoFar
          : current.actorAStrikes + current.actorBStrikes - struckSoFar
        : 1,
    deadlineIso: new Date(current.turnStartedAt.getTime() + STRIKE_TIMEOUT_MS).toISOString(),
  };
}

// The live-set scoreboard: each side's identity and rating sits on its own
// edge, with the set score and one pip per game (best-of-5) centered between
// them. Decided games are colored — emerald when you won, destructive when you
// lost; the playable game gets a pulsing ring; everything else stays muted.
function MatchScoreboard({
  games,
  userId,
  opponentName,
  lang,
  me,
  myIsPracticing,
  opponent,
  viewerIsModerator,
  opponentStreak,
  opponentInZenMode,
  opponentIsPracticing,
  zenMode,
  headToHead,
  topCharacters,
  myTopCharacters,
}: {
  games: MatchGameRow[];
  userId: string;
  opponentName: string;
  lang: Lang;
  me: {
    username: string;
    avatarUrl: string | null;
    rating: number;
    gamesPlayed: number;
    practiceRating: number;
    practiceGamesPlayed: number;
    region: string | null;
  } | null;
  myIsPracticing: boolean;
  opponent: {
    id: string;
    username: string;
    avatarUrl: string | null;
    rating: number;
    gamesPlayed: number;
    practiceRating: number;
    practiceGamesPlayed: number;
    region: string | null;
  };
  viewerIsModerator: boolean;
  opponentStreak: number;
  opponentInZenMode: boolean;
  opponentIsPracticing: boolean;
  zenMode: boolean;
  headToHead: Awaited<ReturnType<typeof getHeadToHead>>;
  topCharacters: string[];
  myTopCharacters: string[];
}) {
  const wins = { me: 0, opponent: 0 };
  for (const g of games) {
    if (g.winnerId === userId) wins.me++;
    else if (g.winnerId) wins.opponent++;
  }
  // Same "current playable game" rule the action section below uses, so the
  // pulsing pip always lines up with whatever GameSection is showing.
  const currentGame = games.find((g) => !g.winnerId && !isDisputedGame(g));
  // Practice sets are rated off practiceRating, not the main ladder rating —
  // showing the main number here is what made players think they were still
  // on the main ladder (see #115). A player's rating is hidden from
  // non-moderators until they've played enough sets on that track (see
  // isRatingVisible) — the ranked count for a ranked set, the practice count
  // for a practice one.
  const myRating = myIsPracticing ? me?.practiceRating : me?.rating;
  const opponentRating = opponentIsPracticing ? opponent.practiceRating : opponent.rating;
  const myGamesOnTrack = myIsPracticing ? (me?.practiceGamesPlayed ?? 0) : (me?.gamesPlayed ?? 0);
  const opponentGamesOnTrack = opponentIsPracticing ? opponent.practiceGamesPlayed : opponent.gamesPlayed;
  const myRatingVisible = isRatingVisible(myGamesOnTrack, viewerIsModerator);
  const opponentRatingVisible = isRatingVisible(opponentGamesOnTrack, viewerIsModerator);

  const labels: string[] = [];
  const pips = Array.from({ length: SET_GAME_COUNT }, (_, i) => {
    const gameNumber = i + 1;
    const game = games[i]; // rows are ordered ascending by gameNumber
    const decided = game?.winnerId ? (game.winnerId === userId ? "won" : "lost") : null;
    const inProgress = currentGame?.gameNumber === gameNumber;
    const label = decided
      ? decided === "won"
        ? tr(lang, {
            en: `Game ${gameNumber} — you won`,
            es: `Juego ${gameNumber} — lo ganaste`,
            ja: `第${gameNumber}試合 — 勝利`,
          })
        : tr(lang, {
            en: `Game ${gameNumber} — you lost`,
            es: `Juego ${gameNumber} — lo perdiste`,
            ja: `第${gameNumber}試合 — 敗北`,
          })
      : inProgress
        ? tr(lang, {
            en: `Game ${gameNumber} — in progress`,
            es: `Juego ${gameNumber} — en curso`,
            ja: `第${gameNumber}試合 — 進行中`,
          })
        : tr(lang, {
            en: `Game ${gameNumber} — upcoming`,
            es: `Juego ${gameNumber} — pendiente`,
            ja: `第${gameNumber}試合 — これから`,
          });
    labels.push(label);
    return (
      <span
        key={gameNumber}
        title={label}
        className={cn(
          "h-2 w-6 rounded-full",
          decided === "won" && "bg-emerald-500",
          decided === "lost" && "bg-destructive",
          inProgress && "animate-pulse bg-primary/25 ring-2 ring-primary/70",
          !decided && !inProgress && "border border-border bg-background/60",
        )}
      />
    );
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-start sm:justify-between">
        {/* You — left edge, same field layout as the opponent's side */}
        <div className="flex min-w-0 items-start gap-3 sm:flex-1">
          {me?.avatarUrl && (
            <Image src={me.avatarUrl} alt={me.username} width={40} height={40} className="shrink-0 rounded-full" />
          )}
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 font-medium">
              <span className="truncate">{tr(lang, { en: "You", es: "Tú", ja: "あなた" })}</span>
              {myIsPracticing && (
                <Badge variant="outline">
                  {tr(lang, {
                    en: "🧪 Practice Mode",
                    es: "🧪 Modo práctica",
                    ja: "🧪 練習モード",
                  })}
                </Badge>
              )}
            </p>
            {(!zenMode || (USES_REGIONS && me?.region)) && (
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground tabular-nums">
                {!zenMode && (
                  <span>
                    {myRatingVisible ? (
                      <>
                        {tr(lang, {
                          en: `${formatRating(myRating ?? 0)}`,
                          es: `${formatRating(myRating ?? 0)}`,
                          ja: `${formatRating(myRating ?? 0)}`,
                        })}
                        {myIsPracticing &&
                          tr(lang, {
                            en: " (practice)",
                            es: " (práctica)",
                            ja: "（練習）",
                          })}
                      </>
                    ) : (
                      <RatingHidden gamesPlayed={myGamesOnTrack} lang={lang} practice={myIsPracticing} />
                    )}
                  </span>
                )}
                {USES_REGIONS && me?.region && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />
                    {me.region}
                  </span>
                )}
              </p>
            )}
            {myTopCharacters.length > 0 && (
              <div className="group/characters relative mt-1 flex items-center gap-1.5">
                <span className="pointer-events-none absolute -top-6 left-0 z-10 rounded border border-border bg-popover px-1.5 py-0.5 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover/characters:opacity-100">
                  {tr(lang, {
                    en: "Most played characters",
                    es: "Personajes más usados",
                    ja: "よく使うキャラ",
                  })}
                </span>
                {myTopCharacters.map((character) => (
                  <CharacterIcon key={character} name={character} size={20} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Set score + game pips — centered between the two sides */}
        <div className="order-first flex shrink-0 flex-col items-center gap-1.5 self-center sm:order-0">
          <p className="flex items-baseline gap-1.5 tabular-nums">
            <span className="text-2xl font-bold">{wins.me}</span>
            <span className="text-base text-muted-foreground">–</span>
            <span className="text-2xl font-bold">{wins.opponent}</span>
          </p>
          <div role="img" aria-label={labels.join(", ")} className="flex items-center gap-1.5">
            {pips}
          </div>
        </div>

        {/* Opponent — right edge */}
        <div className="flex min-w-0 items-start justify-end gap-3 text-right sm:flex-1">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center justify-end gap-1.5 font-medium">
              <Link href={`/players/${opponent.id}`} prefetch={false} className="truncate hover:underline">
                {opponentName}
              </Link>
              {opponentStreak > 0 && (
                <Badge variant="success" className="tabular-nums">
                  {tr(lang, {
                    en: `${opponentStreak} win streak`,
                    es: `${opponentStreak} victorias seguidas`,
                    ja: `${opponentStreak}連勝中`,
                  })}
                </Badge>
              )}
              {opponentInZenMode && (
                <Badge variant="outline">
                  {tr(lang, {
                    en: "🧘 Zen Mode",
                    es: "🧘 Modo Zen",
                    ja: "🧘 ゼンモード",
                  })}
                </Badge>
              )}
              {opponentIsPracticing && (
                <Badge variant="outline">
                  {tr(lang, {
                    en: "Practicing",
                    es: "Practicando",
                    ja: "練習中",
                  })}
                </Badge>
              )}
            </p>
            {(!zenMode || (USES_REGIONS && opponent.region)) && (
              <p className="flex flex-wrap items-center justify-end gap-2 text-sm text-muted-foreground tabular-nums">
                {!zenMode && (
                  <span>
                    {opponentRatingVisible ? (
                      <>
                        {tr(lang, {
                          en: `${formatRating(opponentRating)}`,
                          es: `${formatRating(opponentRating)}`,
                          ja: `${formatRating(opponentRating)}`,
                        })}
                        {opponentIsPracticing &&
                          tr(lang, {
                            en: " (practice)",
                            es: " (práctica)",
                            ja: "（練習）",
                          })}
                      </>
                    ) : (
                      <RatingHidden gamesPlayed={opponentGamesOnTrack} lang={lang} practice={opponentIsPracticing} />
                    )}
                  </span>
                )}
                {USES_REGIONS && opponent.region && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />
                    {opponent.region}
                  </span>
                )}
              </p>
            )}
            {topCharacters.length > 0 && (
              <div className="group/characters relative mt-1 flex items-center justify-end gap-1.5">
                <span className="pointer-events-none absolute -top-6 right-0 z-10 rounded border border-border bg-popover px-1.5 py-0.5 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover/characters:opacity-100">
                  {tr(lang, {
                    en: "Most played characters",
                    es: "Personajes más usados",
                    ja: "よく使うキャラ",
                  })}
                </span>
                {topCharacters.map((character) => (
                  <CharacterIcon key={character} name={character} size={20} />
                ))}
              </div>
            )}
          </div>
          {opponent.avatarUrl && (
            <Image
              src={opponent.avatarUrl}
              alt={opponent.username}
              width={40}
              height={40}
              className="shrink-0 rounded-full"
            />
          )}
        </div>
      </CardContent>

      {/* Your record vs this opponent — its own row along the bottom */}
      <CardContent className="pb-2">
        <p className="text-center text-xs tabular-nums text-muted-foreground">
          {headToHead ? (
            <>
              {tr(lang, {
                en: "Your record: ",
                es: "Tu récord: ",
                ja: "あなたの戦績：",
              })}
              {headToHead.wins}
              {tr(lang, { en: "W", es: "V", ja: "勝" })}–{headToHead.losses}
              {tr(lang, { en: "L", es: "D", ja: "敗" })}
            </>
          ) : (
            tr(lang, {
              en: "First time opponent",
              es: "Primera vez que se enfrentan",
              ja: "初めて当たる相手です",
            })
          )}
        </p>
      </CardContent>
    </Card>
  );
}

// Top-of-card banner that leads with the single most important next step:
// bright primary callout + "Your turn" + a large countdown when the ball is in
// the current player's court, muted and smaller when it's on the opponent.
function MatchActionBanner({
  summary,
  opponentName,
  lang,
}: {
  summary: MatchActionSummary;
  opponentName: string;
  lang: Lang;
}) {
  let tone: "action" | "waiting";
  let kicker: React.ReactNode = null;
  let title: React.ReactNode;
  let detail: React.ReactNode = null;
  let deadlineIso: string | null = null;
  let largeCountdown = false;

  switch (summary.kind) {
    case "start-game": {
      tone = "action";
      kicker = tr(lang, { en: "Your turn", es: "Tu turno", ja: "あなたの番" });
      title = tr(lang, {
        en: `Start Game ${summary.gameNumber}`,
        es: `Empieza el juego ${summary.gameNumber}`,
        ja: `第${summary.gameNumber}試合を始める`,
      });
      detail = tr(lang, {
        en: "Press the button below to start.",
        es: "Presiona el botón de abajo para empezar.",
        ja: "下のボタンを押して始めてください。",
      });
      break;
    }
    case "pick-character": {
      if (summary.mine) {
        tone = "action";
        kicker = tr(lang, {
          en: "Your turn",
          es: "Tu turno",
          ja: "あなたの番",
        });
        title = tr(lang, {
          en: `Pick your character for Game ${summary.gameNumber}`,
          es: `Elige tu personaje para el juego ${summary.gameNumber}`,
          ja: `第${summary.gameNumber}試合の使用キャラを選ぶ`,
        });
        detail = tr(lang, {
          en: "Both players pick a character first, then the stage.",
          es: "Ambos eligen personaje primero, luego el escenario.",
          ja: "まず両者がキャラを選び、その後ステージを決めます。",
        });
        deadlineIso = summary.deadlineIso;
        largeCountdown = true;
      } else {
        tone = "waiting";
        title = tr(lang, {
          en: `Waiting for ${opponentName} to pick a character…`,
          es: `Esperando a que ${opponentName} elija personaje…`,
          ja: `${opponentName}のキャラ選択を待っています…`,
        });
        deadlineIso = summary.deadlineIso;
        if (!deadlineIso) {
          detail = tr(lang, {
            en: "You'll pick after they lock in.",
            es: "Elegirás después de que elija.",
            ja: "相手が確定したら、あなたが選びます。",
          });
        }
      }
      break;
    }
    case "stage": {
      if (summary.mine) {
        tone = "action";
        kicker = tr(lang, {
          en: "Your turn",
          es: "Tu turno",
          ja: "あなたの番",
        });
        title =
          summary.phase === "striking"
            ? tr(lang, {
                en: `Strike ${summary.strikeCount} ${summary.strikeCount === 1 ? "stage" : "stages"} for Game ${summary.gameNumber}`,
                es: `Descarta ${summary.strikeCount} ${summary.strikeCount === 1 ? "escenario" : "escenarios"} para el juego ${summary.gameNumber}`,
                ja: `第${summary.gameNumber}試合のステージを${summary.strikeCount}個BANする`,
              })
            : tr(lang, {
                en: `Pick the stage for Game ${summary.gameNumber}`,
                es: `Elige el escenario del juego ${summary.gameNumber}`,
                ja: `第${summary.gameNumber}試合のステージを選ぶ`,
              });
        detail = tr(lang, {
          en: "If time runs out, it picks for you.",
          es: "Si el tiempo se agota, se elige solo.",
          ja: "時間切れになると自動で選ばれます。",
        });
        deadlineIso = summary.deadlineIso;
        largeCountdown = true;
      } else {
        tone = "waiting";
        title =
          summary.phase === "striking"
            ? tr(lang, {
                en: `Waiting for ${opponentName} to strike for Game ${summary.gameNumber}…`,
                es: `Esperando a que ${opponentName} descarte para el juego ${summary.gameNumber}…`,
                ja: `${opponentName}が第${summary.gameNumber}試合のステージBANをするのを待っています…`,
              })
            : tr(lang, {
                en: `Waiting for ${opponentName} to pick the stage for Game ${summary.gameNumber}…`,
                es: `Esperando a que ${opponentName} elija el escenario del juego ${summary.gameNumber}…`,
                ja: `${opponentName}が第${summary.gameNumber}試合のステージを選ぶのを待っています…`,
              });
        deadlineIso = summary.deadlineIso;
      }
      break;
    }
    case "report-game": {
      if (summary.mine) {
        tone = "action";
        kicker = tr(lang, {
          en: "Your turn",
          es: "Tu turno",
          ja: "あなたの番",
        });
        if (summary.deadlineIso) {
          title = tr(lang, {
            en: `${opponentName} reported Game ${summary.gameNumber} — confirm or dispute it.`,
            es: `${opponentName} reportó el juego ${summary.gameNumber} — confírmalo o dispútalo.`,
            ja: `${opponentName}が第${summary.gameNumber}試合の結果を報告しました。確定するか、異議を出してください。`,
          });
        } else {
          title = tr(lang, {
            en: `Report Game ${summary.gameNumber}'s result`,
            es: `Reporta el resultado del juego ${summary.gameNumber}`,
            ja: `第${summary.gameNumber}試合の結果を報告する`,
          });
          detail = tr(lang, {
            en: "Each player reports their own result.",
            es: "Cada quien reporta su propio resultado.",
            ja: "各自が自分の結果を報告します。",
          });
        }
        deadlineIso = summary.deadlineIso;
        largeCountdown = !!summary.deadlineIso;
      } else {
        tone = "waiting";
        title = tr(lang, {
          en: `Waiting for ${opponentName} to confirm the result…`,
          es: `Esperando a que ${opponentName} confirme el resultado…`,
          ja: `${opponentName}の結果確定を待っています…`,
        });
        deadlineIso = summary.deadlineIso;
      }
      break;
    }
    case "contest": {
      tone = "waiting";
      title = summary.escalated
        ? tr(lang, {
            en: `A mod is reviewing Game ${summary.gameNumber}.`,
            es: `Un mod está revisando el juego ${summary.gameNumber}.`,
            ja: `モデレーターが第${summary.gameNumber}試合を確認しています。`,
          })
        : tr(lang, {
            en: `Game ${summary.gameNumber}'s result is disputed. Resolve it below.`,
            es: `El resultado del juego ${summary.gameNumber} está en disputa. Resuélvelo abajo.`,
            ja: `第${summary.gameNumber}試合の結果に異議が出ています。下で解決してください。`,
          });
      break;
    }
    case "match-disputed": {
      tone = "waiting";
      title = tr(lang, {
        en: "A mod is reviewing this match.",
        es: "Un mod está revisando esta partida.",
        ja: "モデレーターがこの試合を確認しています。",
      });
      detail = tr(lang, {
        en: "Nothing to do for now. We'll notify you when it's resolved.",
        es: "No hay nada que hacer por ahora. Te avisaremos cuando se resuelva.",
        ja: "今はすることはありません。解決したらお知らせします。",
      });
      break;
    }
    case "waiting": {
      tone = "waiting";
      title = tr(lang, {
        en: "Waiting on your opponent…",
        es: "Esperando a tu rival…",
        ja: "相手を待っています…",
      });
      break;
    }
  }

  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg px-4",
        tone === "action" ? "border border-primary/40 bg-primary/10 py-3" : "bg-muted/40 py-2.5",
      )}
    >
      <div className="min-w-0">
        {kicker && <p className="text-[11px] font-semibold tracking-widest text-primary uppercase">{kicker}</p>}
        <p
          className={cn(
            "text-sm",
            kicker && "mt-1",
            tone === "action" ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {title}
        </p>
        {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
      </div>
      {deadlineIso &&
        (largeCountdown ? (
          <div className="shrink-0 text-right">
            <p className="flex items-baseline justify-end gap-1 text-2xl leading-none font-bold tabular-nums">
              <Countdown deadline={deadlineIso} />
              <span className="text-base font-semibold text-muted-foreground">s</span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {tr(lang, {
                en: "time left",
                es: "tiempo restante",
                ja: "残り時間",
              })}
            </p>
          </div>
        ) : (
          <p className="shrink-0 text-sm text-muted-foreground tabular-nums">
            <Countdown deadline={deadlineIso} />s
          </p>
        ))}
    </div>
  );
}

// Soft primary wash for a section that's currently waiting on the current
// player's input, so the part of the card that can actually advance the set is
// where the eyes land. Applied as the section's own box (its CardContent)
// rather than a nested div, so the wash spans the section's full width and
// height instead of adding padding and reading as an inset panel.
const INPUT_FOCUS = "bg-primary/[0.03]";

function GameSection({
  userId,
  match,
  games,
  opponentName,
  myTopCharacters,
  lang,
}: {
  userId: string;
  match: Match;
  games: Awaited<ReturnType<typeof getMatchGames>>;
  opponentName: string;
  myTopCharacters: string[];
  lang: Lang;
}) {
  // A disputed game is skipped here — it doesn't block the rest of the set,
  // so the next (or first playable) game becomes "current" instead.
  const current = games.find((g) => !g.winnerId && !isDisputedGame(g));
  const lastGame = games[games.length - 1];

  if (!current) {
    if (games.length > 0 && lastGame && isDisputedGame(lastGame)) {
      return (
        <CardContent className="border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            <>
              {lastGame.disputeRequestedAt
                ? tr(lang, {
                    en: `Game ${lastGame.gameNumber} is disputed. A mod will resolve it.`,
                    es: `El juego ${lastGame.gameNumber} está en disputa. Un mod lo resolverá.`,
                    ja: `第${lastGame.gameNumber}試合は異議申立中です。モデレーターが解決します。`,
                  })
                : tr(lang, {
                    en: `You and your opponent reported different results for Game ${lastGame.gameNumber}. Confirm or dispute it below.`,
                    es: `Tú y tu rival reportaron resultados distintos en el juego ${lastGame.gameNumber}. Confírmalo o dispútalo abajo.`,
                    ja: `第${lastGame.gameNumber}試合について、あなたと相手の報告が食い違っています。下で確定するか、異議を出してください。`,
                  })}
              {lastGame.finalStage &&
                tr(lang, {
                  en: ` Stage: ${lastGame.finalStage}.`,
                  es: ` Escenario: ${lastGame.finalStage}.`,
                  ja: ` ステージ：${lastGame.finalStage}。`,
                })}
            </>
          </p>
        </CardContent>
      );
    }

    const gameNumber = games.length + 1;
    return (
      <CardContent className={cn("border-t border-border pt-4", INPUT_FOCUS)}>
        <p className="text-sm font-medium">
          {gameNumber === 1
            ? tr(lang, {
                en: "Ready to pick a stage",
                es: "Listo para elegir escenario",
                ja: "ステージを選びます",
              })
            : tr(lang, {
                en: `Game ${gameNumber} — the last game's winner strikes first`,
                es: `Juego ${gameNumber} — quien ganó el último juego descarta primero`,
                ja: `第${gameNumber}試合 — 前の試合に勝った側が先にBANします`,
              })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {tr(lang, {
            en: `Press the button below to start with ${opponentName}. The site walks you through each turn.`,
            es: `Presiona el botón de abajo para empezar con ${opponentName}. El sitio te guía turno por turno.`,
            ja: `下のボタンを押して${opponentName}との対戦を始めてください。進行は画面が案内します。`,
          })}
        </p>
        <form action={beginFirstGame.bind(null, match.id)} className="mt-3">
          <Button type="submit" size="sm">
            {tr(lang, {
              en: `Start Game ${gameNumber} →`,
              es: `Empezar el juego ${gameNumber} →`,
              ja: `第${gameNumber}試合を始める →`,
            })}
          </Button>
        </form>
      </CardContent>
    );
  }

  const turn = gameTurnState(current);
  const isPracticing = userId === match.player1Id ? match.player1IsPracticing : match.player2IsPracticing;
  // Game 1 has no in-match history yet, so lastUsedCharacter falls through to
  // null and this defaults to the player's most-played character instead;
  // every later game already has a locked-in character from the prior game,
  // so this fallback is effectively game-1-only.
  const defaultCharacter = lastUsedCharacter(games, userId) ?? myTopCharacters[0] ?? null;
  const defaultMoveset = lastUsedMoveset(games, userId) ?? "";
  const characterSection = (
    <CharacterPickSection
      userId={userId}
      matchId={match.id}
      game={current}
      opponentName={opponentName}
      isPracticing={isPracticing}
      defaultCharacter={defaultCharacter}
      defaultMoveset={defaultMoveset}
      topCharacters={myTopCharacters}
      lang={lang}
    />
  );

  if (turn.phase === "done") {
    return (
      <>
        {characterSection}
        <CardContent className="border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">{tr(lang, { en: "Stage", es: "Escenario", ja: "ステージ" })}</p>
          {current.finalStage &&
            (() => {
              const imgPath = stageImagePath(current.finalStage!);
              return (
                <div className="relative mt-2 flex h-32 w-48 items-center justify-center overflow-hidden rounded-md border">
                  {imgPath && (
                    <Image
                      src={`/stages/${imgPath}`}
                      alt={current.finalStage!}
                      fill
                      className="object-cover"
                      sizes="192px"
                    />
                  )}
                  <span className="relative z-10 rounded bg-background/80 px-2 py-1 text-sm font-medium">
                    {current.finalStage!}
                  </span>
                </div>
              );
            })()}
        </CardContent>
        <ReportGameSection userId={userId} match={match} game={current} opponentName={opponentName} lang={lang} />
      </>
    );
  }

  const myTurn = turn.actorId === userId;
  const bothLocked = bothCharactersLocked(current);
  const canAct = myTurn && bothLocked;
  const action = turn.phase === "striking" ? strikeStage : pickStage;
  const verb = turn.phase === "striking" ? "strike" : "pick";
  const verbLocalized =
    turn.phase === "striking"
      ? tr(lang, { en: "strike", es: "descartar", ja: "BANする" })
      : tr(lang, { en: "pick", es: "elegir", ja: "選ぶ" });

  // Strikes happen actorA's-share-then-actorB's-share, in order, so the
  // count already struck tells us how many the current actor still owes
  // this turn — worth spelling out since a 2-strike turn (games 2-3's
  // winner) looks identical in the UI to a 1-strike one otherwise.
  const struckSoFar = current.struckStages.length;
  const remainingStrikes =
    turn.phase === "striking"
      ? struckSoFar < current.actorAStrikes
        ? current.actorAStrikes - struckSoFar
        : current.actorAStrikes + current.actorBStrikes - struckSoFar
      : 1;
  const turnDescription =
    turn.phase === "striking"
      ? tr(lang, {
          en: `${verb} ${remainingStrikes} stage${remainingStrikes === 1 ? "" : "s"}`,
          es: `descartar ${remainingStrikes} escenario${remainingStrikes === 1 ? "" : "s"}`,
          ja: `ステージを${remainingStrikes}個BANする`,
        })
      : tr(lang, {
          en: `${verb} a stage`,
          es: "elegir un escenario",
          ja: "ステージを選ぶ",
        });

  // Only shown once both characters are locked in (see the !bothLocked
  // branch below) — at that point turnStartedAt is when the current player's
  // turn began: one continuous clock spanning every strike they owe (it only
  // resets when the turn passes to the other side), so STRIKE_TIMEOUT_MS is
  // the only deadline that applies here.
  const deadline = new Date(current.turnStartedAt.getTime() + STRIKE_TIMEOUT_MS).toISOString();

  const lastStrikeIndex = current.struckStages.length - 1;
  const canUndoLastStrike =
    turn.phase === "striking" &&
    lastStrikeIndex >= 0 &&
    (lastStrikeIndex < current.actorAStrikes ? current.actorAId : current.actorBId) === userId;

  const sameBans =
    turn.phase === "striking" && current.actorAId === userId && current.actorAStrikes === 3 && struckSoFar === 0
      ? lastSameBans(games, userId)
      : null;

  // myTurn, not just phase — "picking" is a property of the game state, not
  // per-player, so without this the side who just finished striking (and
  // can never run it back themselves) saw the button too, just disabled.
  const runItBackStage = turn.phase === "picking" && myTurn ? lastPlayedStage(games, current.gameNumber) : null;
  const canRunItBack = runItBackStage !== null && current.stagesRemaining.includes(runItBackStage);

  return (
    <>
      {characterSection}
      <CardContent className={cn("border-t border-border pt-4", canAct && INPUT_FOCUS)}>
        <p className="text-sm text-muted-foreground">
          {tr(lang, {
            en: `Game ${current.gameNumber} — `,
            es: `Juego ${current.gameNumber} — `,
            ja: `第${current.gameNumber}試合 — `,
          })}
          {!bothLocked
            ? tr(lang, {
                en: "Stage selection starts once you both pick a character.",
                es: "La selección de escenario empieza cuando ambos elijan personaje.",
                ja: "ステージ選択は、両者がキャラを選んでから始まります。",
              })
            : !STRIKING_STAGES && current.gameNumber === 1
              ? // Game 1 is settled by the in-game lottery, so the site records
                // the outcome rather than running the choice.
                tr(lang, {
                  en: "Both players choose the stage they want in game and take whatever the lottery gives — do not pick Random. Record the stage it landed on below.",
                  es: "Ambos eligen el escenario que quieren dentro del juego y aceptan lo que salga — no elijan Aleatorio. Registren abajo el escenario que tocó.",
                  ja: "お互いにゲーム内で戦いたいステージを選び、抽選の結果に従ってください（「おまかせ」は選ばないでください）。決まったステージを下で記録してください。",
                })
              : !STRIKING_STAGES
                ? tr(lang, {
                    en: "The last game's loser picks the stage; the winner selects Random in game.",
                    es: "Quien perdió el último juego elige el escenario; el ganador elige Aleatorio en el juego.",
                    ja: "前の試合に負けた側がステージを選びます。勝った側はゲーム内で「おまかせ」を選んでください。",
                  })
                : !myTurn
                  ? trNode(lang, {
                      en: (
                        <>
                          Waiting for {opponentName} to {verbLocalized}… (
                          <Countdown deadline={deadline} />s left)
                        </>
                      ),
                      es: (
                        <>
                          Esperando a que {opponentName} {verbLocalized}… (
                          <Countdown deadline={deadline} />s restantes)
                        </>
                      ),
                      ja: (
                        <>
                          {opponentName}がステージを{verbLocalized}
                          のを待っています…（残り
                          <Countdown deadline={deadline} />
                          秒）
                        </>
                      ),
                    })
                  : trNode(lang, {
                      en: (
                        <>
                          Your turn — {turnDescription} (
                          <Countdown deadline={deadline} />s left, or it picks automatically).
                        </>
                      ),
                      es: (
                        <>
                          Tu turno — {turnDescription} (
                          <Countdown deadline={deadline} />s restantes, o se elige solo).
                        </>
                      ),
                      ja: (
                        <>
                          あなたの番 — {turnDescription}（残り
                          <Countdown deadline={deadline} />
                          秒。過ぎると自動で選ばれます）。
                        </>
                      ),
                    })}
        </p>
        <StageProposalSection
          matchId={match.id}
          game={current}
          userId={userId}
          opponentName={opponentName}
          lang={lang}
        />
        {sameBans && (
          <div className="mt-3">
            <SameBansButton
              action={sameBansStrike.bind(null, match.id, current.gameNumber)}
              gameNumber={sameBans.gameNumber}
              stages={sameBans.stages}
              canAct={canAct}
              lang={lang}
            />
          </div>
        )}
        {canRunItBack && (
          <div className="mt-3">
            <form action={runItBack.bind(null, match.id, current.gameNumber)}>
              <Button type="submit" size="sm" variant="default" disabled={!canAct}>
                {tr(lang, {
                  en: `Run it back (${runItBackStage})`,
                  es: `Repetir escenario (${runItBackStage})`,
                  ja: `同じステージでもう一戦（${runItBackStage}）`,
                })}
              </Button>
            </form>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {(() => {
            const pool: readonly string[] = current.gameNumber === 1 ? GAME_ONE_STAGES : COUNTERPICK_STAGES;
            const allStages = [...new Set([...current.struckStages, ...current.stagesRemaining])];
            return allStages.sort((a, b) => pool.indexOf(a) - pool.indexOf(b));
          })().map((stage) => {
            const isStruck = current.struckStages.includes(stage);
            const imgPath = stageImagePath(stage);
            return (
              <form key={stage} action={action.bind(null, match.id, current.gameNumber, stage)}>
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={!canAct || isStruck}
                  className={`relative flex h-24 w-36 max-sm:h-20 max-sm:w-28 flex-col items-center justify-end gap-1 overflow-hidden p-2 ${isStruck ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  {imgPath && (
                    <Image src={`/stages/${imgPath}`} alt={stage} fill className="object-cover" sizes="128px" />
                  )}
                  <span className="relative z-10 rounded bg-background/80 px-1 text-xs max-sm:text-[10px] font-medium">
                    {stage}
                  </span>
                  {isStruck && (
                    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                      <span
                        className="leading-none text-red-500 opacity-80 drop-shadow-[0_0_8px_rgba(0,0,0,0.95)]"
                        style={{ fontSize: "5rem" }}
                      >
                        ✕
                      </span>
                    </div>
                  )}
                </Button>
              </form>
            );
          })}
        </div>
        {canUndoLastStrike && (
          <form action={unstrikeStage.bind(null, match.id, current.gameNumber)} className="mt-2">
            <Button type="submit" size="sm" variant="outline">
              {tr(lang, {
                en: "Undo my last strike",
                es: "Deshacer mi último descarte",
                ja: "直前のBANを取り消す",
              })}
            </Button>
          </form>
        )}
      </CardContent>
    </>
  );
}

// The only two stages players actually agree on: of 300 reconstructed game-1
// agreements, 184 were Small Battlefield and 104 Pokémon Stadium 2 — 96% of
// them (scripts/feature-usage.ts). The rest of the pool stays available but
// collapsed, so these two can be one click instead of two. The labels are the
// shorthand players already type at each other in chat.
const PROPOSAL_SHORTCUTS = [
  { stage: "Small Battlefield", short: "Small?" },
  { stage: "Pokémon Stadium 2", short: "PS2?" },
] as const;

// "Small?" — the mutual-agreement shortcut: either player can propose any
// stage still on the table and the other side accepts or declines, at any
// point before finalStage is set. Deliberately independent of whose turn it
// is to strike/pick and of bothCharactersLocked (see proposeGameStage) — it
// works through character select and even on game 1's blind pick, where
// Run it Back/Same Bans don't apply.
function StageProposalSection({
  matchId,
  game,
  userId,
  opponentName,
  lang,
}: {
  matchId: string;
  game: {
    gameNumber: number;
    stagesRemaining: string[];
    proposedStage: string | null;
    proposedById: string | null;
  };
  userId: string;
  opponentName: string;
  lang: Lang;
}) {
  if (game.proposedById) {
    const proposedByMe = game.proposedById === userId;
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
        <p className="text-sm">
          {proposedByMe
            ? tr(lang, {
                en: `You proposed ${game.proposedStage} — waiting on ${opponentName}.`,
                es: `Propusiste ${game.proposedStage} — esperando a ${opponentName}.`,
                ja: `${game.proposedStage}を提案しました。${opponentName}の返答を待っています。`,
              })
            : tr(lang, {
                en: `${opponentName} proposed ${game.proposedStage}.`,
                es: `${opponentName} propuso ${game.proposedStage}.`,
                ja: `${opponentName}が${game.proposedStage}を提案しました。`,
              })}
        </p>
        {proposedByMe ? (
          <form action={withdrawStageProposal.bind(null, matchId, game.gameNumber)}>
            <Button type="submit" size="sm" variant="outline">
              {tr(lang, { en: "Withdraw", es: "Retirar", ja: "取り下げる" })}
            </Button>
          </form>
        ) : (
          <>
            <form action={acceptStageProposal.bind(null, matchId, game.gameNumber)}>
              <Button type="submit" className="h-10 px-5 text-base font-semibold">
                {tr(lang, { en: "Accept", es: "Aceptar", ja: "承諾" })}
              </Button>
            </form>
            <form action={declineStageProposal.bind(null, matchId, game.gameNumber)}>
              <Button type="submit" size="sm" variant="outline">
                {tr(lang, { en: "Decline", es: "Rechazar", ja: "拒否" })}
              </Button>
            </form>
          </>
        )}
      </div>
    );
  }

  const shortcuts = PROPOSAL_SHORTCUTS.filter((s) => game.stagesRemaining.includes(s.stage));
  const rest = game.stagesRemaining.filter((stage) => !shortcuts.some((s) => s.stage === stage));

  return (
    <div className="mt-3">
      {shortcuts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {shortcuts.map(({ stage, short }) => (
            <form key={stage} action={proposeStage.bind(null, matchId, game.gameNumber, stage)}>
              <Button type="submit" className="h-10 px-5 text-base font-semibold">
                {short}
              </Button>
            </form>
          ))}
          <span className="text-xs text-muted-foreground">
            {tr(lang, {
              en: "Propose it and skip striking",
              es: "Propón y sáltate el descarte",
              ja: "これを提案してBANを省略する",
            })}
          </span>
        </div>
      )}
      {rest.length > 0 && (
        <details className="mt-2 group">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            {tr(lang, {
              en: "Propose a different stage",
              es: "Proponer otro escenario",
              ja: "別のステージを提案する",
            })}
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {rest.map((stage) => (
              <form key={stage} action={proposeStage.bind(null, matchId, game.gameNumber, stage)}>
                <Button type="submit" size="sm" variant="outline">
                  {stage}
                </Button>
              </form>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function characterLabel(character: string, moveset: string | null) {
  return moveset ? `${character} (${moveset})` : character;
}

async function CharacterPickSection({
  userId,
  matchId,
  game,
  opponentName,
  isPracticing,
  defaultCharacter,
  defaultMoveset,
  topCharacters,
  lang,
}: {
  userId: string;
  matchId: string;
  game: {
    gameNumber: number;
    actorAId: string;
    actorBId: string;
    actorACharacter: string | null;
    actorAMoveset: string | null;
    actorBCharacter: string | null;
    actorBMoveset: string | null;
    createdAt: Date;
    characterPickDeadline: Date;
  };
  opponentName: string;
  defaultCharacter: string | null;
  defaultMoveset: string;
  topCharacters: string[];
  isPracticing: boolean;
  lang: Lang;
}) {
  const { yourCharacter, yourMoveset, opponentCharacter, opponentMoveset, canPickNow } = characterPickState(
    game,
    userId,
  );
  // Silent from the player's point of view otherwise — autoResolveStaleCharacterPick
  // resolves the stalled pick once this window closes. Game 1 is a blind
  // simultaneous pick on ONE clock shared by both sides: it starts at the game's
  // creation and a lock-in never restarts it, so both players are always reading
  // the same countdown and the second one to pick doesn't get a fresh — or
  // shorter — window. Games 2+ pick in order, so pickGameCharacter does reset
  // characterPickDeadline when actorA locks in, giving actorB their own full
  // window from their opponent's pick.
  const pickDeadline = new Date(game.characterPickDeadline.getTime());
  const secondsLeft = secondsUntil(pickDeadline);
  const deadline = pickDeadline.toISOString();
  // What running out of time actually costs differs by game (see
  // autoResolveStaleCharacterPick): game 1 forfeits the set to whoever locked in,
  // games 2+ fall back to the character they played in the previous game — while
  // a pick their opponent already made stands.
  const isGameOne = game.gameNumber === 1;
  const timeoutCost: Record<Lang, string> = isGameOne
    ? {
        en: "you forfeit this set",
        es: "pierdes este set por abandono",
        ja: "このセットは不戦敗になります",
      }
    : {
        en: "your character from the last game is used",
        es: "se usa tu personaje del último juego",
        ja: "前の試合で使ったキャラが使われます",
      };
  const expiredNote: Record<Lang, string> = isGameOne
    ? {
        en: "You're past the deadline. Pick now or you forfeit the set.",
        es: "Pasó el plazo. Elige ahora o pierdes el set por abandono.",
        ja: "期限を過ぎています。今すぐ選ばないとセットが不戦敗になります。",
      }
    : {
        en: "You're past the deadline. Pick now or your character from the last game is used.",
        es: "Pasó el plazo. Elige ahora o se usa tu personaje del último juego.",
        ja: "期限を過ぎています。今すぐ選ばないと、前の試合で使ったキャラが使われます。",
      };

  if (yourCharacter && opponentCharacter) {
    const matchupNote = await getMatchupNote(userId, opponentCharacter);
    return (
      <CardContent className="border-t border-border pt-4">
        {matchupNote && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <NotebookPen className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary">
                {tr(lang, {
                  en: `Your note on ${opponentCharacter}`,
                  es: `Tu nota sobre ${opponentCharacter}`,
                  ja: `${opponentCharacter}への対策メモ`,
                })}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{matchupNote}</p>
            </div>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          <>
            {tr(lang, {
              en: "Characters — you: ",
              es: "Personajes — tú: ",
              ja: "使用キャラ — あなた：",
            })}
            <span className="font-medium text-foreground">
              <CharacterIcon name={yourCharacter} size={16} className="mr-1 inline align-[-0.25em]" />
              {characterLabel(yourCharacter, yourMoveset)}
            </span>
            , {opponentName}:{" "}
            <span className="font-medium text-foreground">
              <CharacterIcon name={opponentCharacter} size={16} className="mr-1 inline align-[-0.25em]" />
              {characterLabel(opponentCharacter, opponentMoveset)}
            </span>
          </>
        </p>
      </CardContent>
    );
  }

  if (yourCharacter && !opponentCharacter) {
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          <>
            {tr(lang, {
              en: "You picked ",
              es: "Elegiste ",
              ja: "あなたの使用キャラ：",
            })}
            <span className="font-medium text-foreground">
              <CharacterIcon name={yourCharacter} size={16} className="mr-1 inline align-[-0.25em]" />
              {characterLabel(yourCharacter, yourMoveset)}
            </span>
            {tr(lang, {
              en: `. Waiting for ${opponentName} to pick… `,
              es: `. Esperando a que ${opponentName} elija… `,
              ja: `。${opponentName}のキャラ選択を待っています… `,
            })}
            {secondsLeft > 0
              ? isGameOne
                ? trNode(lang, {
                    en: (
                      <>
                        You win the set by forfeit if they don&apos;t pick in <Countdown deadline={deadline} />
                        s.
                      </>
                    ),
                    es: (
                      <>
                        Ganas el set por abandono si no elige en <Countdown deadline={deadline} />
                        s.
                      </>
                    ),
                    ja: (
                      <>
                        残り
                        <Countdown deadline={deadline} />
                        秒で相手が選ばなければ、あなたのセット勝ち（不戦勝）になります。
                      </>
                    ),
                  })
                : trNode(lang, {
                    en: (
                      <>
                        If they don&apos;t pick in <Countdown deadline={deadline} />
                        s, their character from the last game is used.
                      </>
                    ),
                    es: (
                      <>
                        Si no elige en <Countdown deadline={deadline} />
                        s, se usa su personaje del último juego.
                      </>
                    ),
                    ja: (
                      <>
                        残り
                        <Countdown deadline={deadline} />
                        秒で相手が選ばなければ、相手が前の試合で使ったキャラが使われます。
                      </>
                    ),
                  })
              : isGameOne
                ? tr(lang, {
                    en: "The deadline passed. This should resolve in your favor soon.",
                    es: "Pasó el plazo. Esto debería resolverse a tu favor pronto.",
                    ja: "期限を過ぎました。まもなくあなたに有利な形で処理されます。",
                  })
                : tr(lang, {
                    en: "The deadline passed. This should resolve shortly.",
                    es: "Pasó el plazo. Esto debería resolverse en breve.",
                    ja: "期限を過ぎました。まもなく処理されます。",
                  })}
          </>
        </p>
      </CardContent>
    );
  }

  if (!canPickNow) {
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          {tr(lang, {
            en: `Waiting for ${opponentName} to pick a character first.`,
            es: `Esperando a que ${opponentName} elija personaje primero.`,
            ja: `${opponentName}が先にキャラを選ぶのを待っています。`,
          })}
        </p>
      </CardContent>
    );
  }

  return (
    <CardContent className={cn("border-t border-border pt-4", INPUT_FOCUS)}>
      <p className="text-sm text-muted-foreground">
        {isGameOne ? (
          tr(lang, {
            en: "Pick your character. It stays hidden until you both pick.",
            es: "Elige tu personaje. Queda oculto hasta que ambos elijan.",
            ja: "使用キャラを選んでください。両者が選ぶまで相手には見えません。",
          })
        ) : opponentCharacter ? (
          <>
            {tr(lang, {
              en: `${opponentName} picked `,
              es: `${opponentName} eligió `,
              ja: `${opponentName}の使用キャラ：`,
            })}
            <span className="font-medium text-foreground">
              <CharacterIcon name={opponentCharacter} size={16} className="mr-1 inline align-[-0.25em]" />
              {characterLabel(opponentCharacter, opponentMoveset)}
            </span>
            {tr(lang, {
              en: ". Pick your character.",
              es: ". Elige tu personaje.",
              ja: "。使用キャラを選んでください。",
            })}
          </>
        ) : (
          tr(lang, {
            en: "Pick your character. You go first.",
            es: "Elige tu personaje. Vas primero.",
            ja: "使用キャラを選んでください。あなたが先です。",
          })
        )}{" "}
        {secondsLeft > 0 ? (
          <span className="font-medium text-foreground">
            {trNode(lang, {
              en: (
                <>
                  You have <Countdown deadline={deadline} />s to pick or {timeoutCost.en}.
                </>
              ),
              es: (
                <>
                  Tienes <Countdown deadline={deadline} />s para elegir o {timeoutCost.es}.
                </>
              ),
              ja: (
                <>
                  残り
                  <Countdown deadline={deadline} />
                  秒以内に選んでください。過ぎると{timeoutCost.ja}。
                </>
              ),
            })}
          </span>
        ) : (
          <span className="font-medium text-destructive">{expiredNote[lang]}</span>
        )}
      </p>
      {isPracticing && (
        <p className="mt-2 text-xs text-muted-foreground">
          {tr(lang, {
            en: "You queued as Practicing. This set only affects your practice rating.",
            es: "Entraste en modo Práctica. Esta partida solo afecta tu clasificación de práctica.",
            ja: "練習として待機しました。このセットは練習レートにのみ影響します。",
          })}
        </p>
      )}
      <CharacterPickForm
        key={game.gameNumber}
        defaultCharacter={defaultCharacter}
        defaultMoveset={defaultMoveset}
        topCharacters={topCharacters}
        action={pickCharacter.bind(null, matchId, game.gameNumber)}
        lang={lang}
      />
    </CardContent>
  );
}

function ReportGameSection({
  userId,
  match,
  game,
  opponentName,
  lang,
}: {
  userId: string;
  match: Match;
  game: Awaited<ReturnType<typeof getMatchGames>>[number];
  opponentName: string;
  lang: Lang;
}) {
  // The report clock only starts once someone has actually reported (see
  // reportedAt) — not from when the stage was picked, so actually playing
  // the game never eats into it. No deadline exists yet if neither side has
  // reported: that case falls through to the 3h match-level fallback instead
  // (see REPORT_TIMEOUT_MS's own comment in lib/match-games.ts).
  const reportDeadline = game.reportedAt ? new Date(game.reportedAt.getTime() + REPORT_TIMEOUT_MS) : null;
  const secondsLeft = reportDeadline ? secondsUntil(reportDeadline) : null;
  const deadline = reportDeadline?.toISOString();
  // The report buttons only need the current player while they haven't
  // reported yet — once you've reported you're just waiting on the opponent.
  const needsMyReport = game.reportedById !== userId;
  // Each player reports their own result independently. The buttons never
  // change based on who reported first — the other side's claim (and the
  // report clock) is shown as a status line below rather than replacing the
  // controls.
  let statusLine: React.ReactNode = null;
  if (game.reportedById === userId) {
    statusLine = (
      <>
        {tr(lang, {
          en: `Waiting for ${opponentName} to confirm… `,
          es: `Esperando a que ${opponentName} confirme… `,
          ja: `${opponentName}の確定を待っています… `,
        })}
        {secondsLeft !== null && secondsLeft > 0
          ? trNode(lang, {
              en: (
                <>
                  It auto-confirms in <Countdown deadline={deadline!} />
                  s.
                </>
              ),
              es: (
                <>
                  Se confirma solo en <Countdown deadline={deadline!} />
                  s.
                </>
              ),
              ja: (
                <>
                  残り
                  <Countdown deadline={deadline!} />
                  秒で自動的に確定します。
                </>
              ),
            })
          : tr(lang, {
              en: "The deadline passed. This should resolve in your favor soon.",
              es: "Pasó el plazo. Esto debería resolverse a tu favor pronto.",
              ja: "期限を過ぎました。まもなくあなたに有利な形で処理されます。",
            })}
      </>
    );
  } else if (game.reportedById) {
    statusLine = (
      <>
        {game.reportedWinnerId === userId
          ? tr(lang, {
              en: `${opponentName} reported that you won. `,
              es: `${opponentName} reportó que ganaste. `,
              ja: `${opponentName}が「あなたの勝ち」と報告しました。 `,
            })
          : tr(lang, {
              en: `${opponentName} reported that they won. `,
              es: `${opponentName} reportó que ganó. `,
              ja: `${opponentName}が「自分の勝ち」と報告しました。 `,
            })}
        {secondsLeft !== null &&
          secondsLeft > 0 &&
          trNode(lang, {
            en: (
              <>
                Confirm or dispute within <Countdown deadline={deadline!} />
                s.
              </>
            ),
            es: (
              <>
                Confirma o disputa antes de <Countdown deadline={deadline!} />
                s.
              </>
            ),
            ja: (
              <>
                残り
                <Countdown deadline={deadline!} />
                秒以内に確定するか、異議を出してください。
              </>
            ),
          })}
      </>
    );
  }

  const body = (
    <>
      <p className="text-sm text-muted-foreground">
        {tr(lang, {
          en: `Report Game ${game.gameNumber}'s result after you play. If only one player reports, the other has ${REPORT_TIMEOUT_MS / 60_000} minutes to confirm or dispute. After that, the report stands and the other player gets a no-show.`,
          es: `Reporta el resultado del juego ${game.gameNumber} después de jugar. Si solo uno reporta, el otro tiene ${REPORT_TIMEOUT_MS / 60_000} minutos para confirmar o disputar. Pasado ese plazo, el reporte queda firme y el otro recibe un no-show.`,
          ja: `対戦後に第${game.gameNumber}試合の結果を報告してください。片方だけが報告した場合、もう一方には確定または異議申立のために${REPORT_TIMEOUT_MS / 60_000}分あります。それを過ぎると報告がそのまま確定し、もう一方は不参加として扱われます。`,
        })}
      </p>
      <div className="mt-4 flex gap-2">
        <ConfirmSubmitButton
          action={reportGame.bind(null, match.id, game.gameNumber, true)}
          confirmMessage={tr(lang, {
            en: `Report that you won game ${game.gameNumber}?`,
            es: `¿Reportar que ganaste el juego ${game.gameNumber}?`,
            ja: `第${game.gameNumber}試合に勝ったと報告しますか？`,
          })}
          variant="success"
          lang={lang}
        >
          {tr(lang, { en: "I Won", es: "Gané", ja: "勝った" })}
        </ConfirmSubmitButton>
        <ConfirmSubmitButton
          action={reportGame.bind(null, match.id, game.gameNumber, false)}
          confirmMessage={tr(lang, {
            en: `Report that you lost game ${game.gameNumber}?`,
            es: `¿Reportar que perdiste el juego ${game.gameNumber}?`,
            ja: `第${game.gameNumber}試合に負けたと報告しますか？`,
          })}
          variant="destructive"
          lang={lang}
        >
          {tr(lang, { en: "I Lost", es: "Perdí", ja: "負けた" })}
        </ConfirmSubmitButton>
      </div>
      {statusLine && <p className="mt-4 text-sm text-muted-foreground">{statusLine}</p>}
    </>
  );

  return <CardContent className={cn("border-t border-border pt-4", needsMyReport && INPUT_FOCUS)}>{body}</CardContent>;
}

async function ConfirmedSection({
  userId,
  match,
  viewerIsModerator,
  lang,
}: {
  userId: string;
  match: Match;
  viewerIsModerator: boolean;
  lang: Lang;
}) {
  const won = match.reportedWinnerId === userId;
  const ratingBefore = match.player1Id === userId ? match.player1RatingBefore : match.player2RatingBefore;
  const ratingAfter = match.player1Id === userId ? match.player1RatingAfter : match.player2RatingAfter;
  // Derived from the rounded before/after rather than the raw floats, so the
  // trail below always adds up — see formatRating.
  const delta = formatRating(ratingAfter ?? 0) - formatRating(ratingBefore ?? 0);
  const practicing = match.player1Id === userId ? match.player1IsPracticing : match.player2IsPracticing;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { gamesPlayed: true, practiceGamesPlayed: true },
  });
  // This match moved the practice track when the viewer queued as practicing,
  // so gate on that track's own count — and hide it the same way as the main
  // rating (see isRatingVisible). The post-match number is only presented once
  // the player is past provisional; before that a win shows a plain
  // confirmation rather than a celebration built around a hidden rating.
  // Moderators see it throughout.
  const gamesOnTrack = practicing ? (me?.practiceGamesPlayed ?? 0) : (me?.gamesPlayed ?? 0);
  const ratingVisible = isRatingVisible(gamesOnTrack, viewerIsModerator);

  let body: React.ReactNode;
  if (ratingVisible && won && ratingBefore !== null && ratingAfter !== null) {
    // Practice sets never touch the tier ladder, so a practice win is a plain
    // victory celebration with no tier-up attached (see the practice-rating
    // note in applyEloAndConfirm).
    const tierUp = !practicing && didTierUp(ratingBefore, ratingAfter, gamesOnTrack);
    const tier = practicing ? null : getRankTier(ratingAfter, gamesOnTrack);
    body = (
      <VictoryCelebration
        ratingBefore={ratingBefore}
        ratingAfter={ratingAfter}
        tierUp={tierUp}
        tierName={tier?.name}
        lang={lang}
      />
    );
  } else {
    body = (
      <>
        <p className="text-sm font-medium">
          {won
            ? tr(lang, {
                en: "Set confirmed — you won",
                es: "Partida confirmada — ganaste",
                ja: "セット確定 — あなたの勝ち",
              })
            : tr(lang, {
                en: "Set confirmed — you lost",
                es: "Partida confirmada — perdiste",
                ja: "セット確定 — あなたの負け",
              })}
        </p>
        {ratingVisible && ratingBefore !== null && ratingAfter !== null ? (
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            {formatRating(ratingBefore)} → {formatRating(ratingAfter)} ({delta >= 0 ? "+" : ""}
            {delta})
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            <RatingHidden gamesPlayed={gamesOnTrack} lang={lang} practice={practicing} />
          </p>
        )}
      </>
    );
  }

  return <CardContent className="pt-4">{body}</CardContent>;
}

// Mutual opt-in: whoever clicks second is the one whose click actually
// creates the next match (see requestRematch) — from either player's own
// view, "Request" and "Accept" are the same action, just labeled based on
// whether the opponent has already asked.
function RematchSection({
  matchId,
  opponentName,
  myRequestedAt,
  opponentRequestedAt,
  opponentLeftAt,
  opponentUnavailable,
  lang,
}: {
  matchId: string;
  opponentName: string;
  myRequestedAt: Date | null;
  opponentRequestedAt: Date | null;
  opponentLeftAt: Date | null;
  opponentUnavailable: boolean;
  lang: Lang;
}) {
  if (opponentLeftAt) {
    return (
      <p className="text-xs text-muted-foreground">
        {tr(lang, {
          en: `${opponentName} has left — rematch unavailable.`,
          es: `${opponentName} se fue — revancha no disponible.`,
          ja: `${opponentName}が退出したため、再戦できません。`,
        })}
      </p>
    );
  }

  if (myRequestedAt) {
    if (opponentUnavailable) {
      return (
        <p className="text-xs text-muted-foreground">
          {tr(lang, {
            en: `${opponentName} is no longer available — they've moved on to another match.`,
            es: `${opponentName} ya no está disponible — pasó a otra partida.`,
            ja: `${opponentName}は別の対戦に移ったため、再戦できません。`,
          })}
        </p>
      );
    }
    return (
      <p className="text-xs text-muted-foreground">
        {tr(lang, {
          en: `Waiting for ${opponentName} to accept the rematch…`,
          es: `Esperando a que ${opponentName} acepte la revancha…`,
          ja: `${opponentName}が再戦に応じるのを待っています…`,
        })}
      </p>
    );
  }

  if (opponentUnavailable) {
    return (
      <p className="text-xs text-muted-foreground">
        {tr(lang, {
          en: `${opponentName} is no longer available — they've moved on to another match.`,
          es: `${opponentName} ya no está disponible — pasó a otra partida.`,
          ja: `${opponentName}は別の対戦に移ったため、再戦できません。`,
        })}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {opponentRequestedAt && (
        <p className="text-xs text-muted-foreground">
          {tr(lang, {
            en: `${opponentName} wants a rematch!`,
            es: `¡${opponentName} quiere revancha!`,
            ja: `${opponentName}が再戦を希望しています！`,
          })}
        </p>
      )}
      <form action={requestRematchAction.bind(null, matchId)}>
        <Button type="submit" variant="outline" size="sm">
          {opponentRequestedAt
            ? tr(lang, {
                en: "Accept Rematch",
                es: "Aceptar revancha",
                ja: "再戦を受ける",
              })
            : tr(lang, {
                en: "Request Rematch",
                es: "Pedir revancha",
                ja: "再戦を申し込む",
              })}
        </Button>
      </form>
    </div>
  );
}

function MutualCancelSection({
  matchId,
  myRequestedAt,
  opponentRequestedAt,
  opponentName,
  lang,
}: {
  matchId: string;
  myRequestedAt: Date | null;
  opponentRequestedAt: Date | null;
  opponentName: string;
  lang: Lang;
}) {
  if (myRequestedAt) {
    return (
      <p className="text-xs text-muted-foreground">
        {tr(lang, {
          en: `Waiting for ${opponentName} to agree…`,
          es: `Esperando a que ${opponentName} esté de acuerdo…`,
          ja: `${opponentName}の同意を待っています…`,
        })}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {opponentRequestedAt && (
        <p className="text-xs text-muted-foreground">
          {tr(lang, {
            en: `${opponentName} wants to cancel!`,
            es: `¡${opponentName} quiere cancelar!`,
            ja: `${opponentName}が中止を希望しています！`,
          })}
        </p>
      )}
      <form action={requestMutualCancelAction.bind(null, matchId)}>
        <Button type="submit" variant="outline" size="sm">
          {opponentRequestedAt
            ? tr(lang, {
                en: "Agree to Cancel",
                es: "Aceptar cancelación",
                ja: "中止に同意する",
              })
            : tr(lang, {
                en: "Request Cancel",
                es: "Pedir cancelación",
                ja: "中止を申し込む",
              })}
        </Button>
      </form>
    </div>
  );
}

function TerminatedSection({ status, lang }: { status: "CANCELLED" | "EXPIRED"; lang: Lang }) {
  return (
    <CardContent className="pt-4">
      <p className="text-sm text-muted-foreground">
        {status === "CANCELLED"
          ? tr(lang, {
              en: "This match was cancelled — no rating impact.",
              es: "Esta partida fue cancelada — sin afectar la clasificación.",
              ja: "この試合は中止されました。レートには影響しません。",
            })
          : tr(lang, {
              en: "Nobody reported a result in time, so this match expired with no rating impact.",
              es: "Nadie reportó un resultado a tiempo, así que esta partida expiró sin afectar la clasificación.",
              ja: "誰も期限内に結果を報告しなかったため、この試合は無効になりました。レートには影響しません。",
            })}
      </p>
    </CardContent>
  );
}

async function CommentsSection({
  userId,
  match,
  opponentName,
  opponentHasLeft,
  lang,
}: {
  userId: string;
  match: Match;
  opponentName: string;
  opponentHasLeft: boolean;
  lang: Lang;
}) {
  const rawComments = await listMatchComments(userId, match.id);
  const opponentTyping = await isOpponentTyping(match.id, userId);
  const myQuickMessagesRaw = await prisma.user.findUnique({
    where: { id: userId },
    select: { quickMessages: true },
  });
  const myQuickMessages = resolveQuickMessages(myQuickMessagesRaw?.quickMessages ?? []);

  // Serialize dates to strings for the client component
  const comments = rawComments.map((c) => ({
    id: c.id,
    author: {
      username: c.author.username,
      role: c.author.role,
    },
    body: c.body,
    translatedBody: c.translatedBody,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <Card className="flex h-full max-lg:max-h-[60vh] lg:max-h-[min(60vh,600px)] flex-col">
      <CardHeader className="pb-3">
        <p className="text-sm font-medium text-foreground">💬 Chat</p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-0 pt-0">
        {opponentHasLeft && (
          <p className="mb-2 text-xs text-muted-foreground">
            {tr(lang, {
              en: `${opponentName} has left the chat.`,
              es: `${opponentName} dejó el chat.`,
              ja: `${opponentName}がチャットから退出しました。`,
            })}
          </p>
        )}
        <ChatMessages
          comments={comments}
          empty={
            <p className="mt-2 text-sm text-muted-foreground">
              {tr(lang, {
                en: "No messages yet.",
                es: "Aún no hay mensajes.",
                ja: "まだメッセージはありません。",
              })}
            </p>
          }
        />
        {opponentTyping && !opponentHasLeft && <TypingIndicator opponentName={opponentName} lang={lang} />}
        <CommentForm
          action={sendMatchCommentAction.bind(null, match.id)}
          onTyping={signalTypingAction.bind(null, match.id)}
          quickMessages={myQuickMessages}
          lang={lang}
        />
      </CardContent>
    </Card>
  );
}

function RoomCodeSection({
  matchId,
  initialValue,
  isHost,
  opponentName,
  myArenaPassword,
  opponentArenaPassword,
  lang,
}: {
  matchId: string;
  initialValue: string;
  isHost: boolean;
  opponentName: string;
  myArenaPassword: string;
  opponentArenaPassword: string;
  lang: Lang;
}) {
  // Hosting is assigned up front (see getRoomHostId), not decided by who
  // sets a code first — so which password matters is already known,
  // independent of whether the host has actually submitted one yet.
  const hostArenaPassword = isHost ? myArenaPassword : opponentArenaPassword;

  if (!isHost) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-medium tabular-nums">
          <FlashOnChange value={initialValue}>
            {initialValue ||
              tr(lang, {
                en: `${opponentName} is creating the room…`,
                es: `${opponentName} está creando la sala…`,
                ja: `${opponentName}が部屋を作成しています…`,
              })}
          </FlashOnChange>
        </p>
        {initialValue && (
          <p className="text-xs text-muted-foreground">
            {tr(lang, {
              en: "Set by your opponent — join with this.",
              es: "Definido por tu rival — únete con este.",
              ja: "相手が設定しました。これで参加してください。",
            })}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          <>
            {tr(lang, {
              en: "Password: ",
              es: "Contraseña: ",
              ja: "パスワード：",
            })}
            <span className="font-medium text-foreground">{hostArenaPassword}</span>.
          </>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-foreground">
        {tr(lang, {
          en: "You're creating the room.",
          es: "Te toca crear la sala.",
          ja: "あなたが部屋を作成します。",
        })}
      </p>
      <RoomCodeForm initialValue={initialValue} action={submitRoomCode.bind(null, matchId)} lang={lang} />
      <p className="text-xs text-muted-foreground">
        {trNode(lang, {
          en: (
            <>
              Password: <span className="font-medium text-foreground">{hostArenaPassword}</span> — this is your default,
              you can{" "}
              <Link href="/settings?tab=lobby" prefetch={false} className="underline hover:text-foreground">
                change it in Settings
              </Link>
              .
            </>
          ),
          es: (
            <>
              Contraseña: <span className="font-medium text-foreground">{hostArenaPassword}</span> — este es tu valor
              por defecto, puedes{" "}
              <Link href="/settings?tab=lobby" prefetch={false} className="underline hover:text-foreground">
                cambiarlo en Ajustes
              </Link>
              .
            </>
          ),
          ja: (
            <>
              パスワード：
              <span className="font-medium text-foreground">{hostArenaPassword}</span> — これは既定値です。
              <Link href="/settings?tab=lobby" prefetch={false} className="underline hover:text-foreground">
                設定から変更できます
              </Link>
              。
            </>
          ),
        })}
      </p>
    </div>
  );
}
