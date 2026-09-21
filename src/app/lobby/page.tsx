import Image from "next/image";
import Link from "next/link";
import { Check, Clock, Loader2, Lock, MapPin, NotebookPen, SlidersHorizontal, Swords, Users, ThumbsUp } from "lucide-react";
import { auth } from "@/auth";
import { getMatchupNote } from "@/lib/matchup-notes";
import { prisma } from "@/lib/db";
import { getActiveLobbyEntry, getLobbyActivityStats, retryPairForWaitingUser } from "@/lib/lobby";
import { PushNudgeBanner } from "@/components/push-nudge-banner";
import { SupporterBanner } from "@/components/supporter-banner";
import { getSupporterCount } from "@/lib/public-stats";
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
import { stageImagePath, GAME_ONE_STAGES, COUNTERPICK_STAGES } from "@/lib/stages";
import { listMatchComments, isOpponentTyping } from "@/lib/match-comments";
import { referralLink } from "@/lib/referrals";
import { CopyButton } from "@/components/copy-button";
import { MATCH_DISTANCE_PRESETS, MATCH_REGION_GROUPS, REGION_REFERENCE_CITY } from "@/lib/regions";
import { MATCH_RATING_GAP_PRESETS, didTierUp, getRankTier } from "@/lib/rank-tier";
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
import { DisputeResolutionForm } from "@/components/dispute-resolution-form";
import { CommentForm } from "@/components/comment-form";
import { ChatMessages } from "@/components/chat-messages";
import { TypingIndicator } from "@/components/typing-indicator";
import { ReportConductForm } from "@/components/report-conduct-form";
import { MatchSettingsForm, type MatchSettingsState } from "@/components/match-settings-form";
import { getLang, type Lang } from "@/lib/i18n";
import {
  beginFirstGame,
  cancelLobby,
  cancelMatchInProgress,
  joinLobby,
  leaveMatchAction,
  signalTypingAction,
  pickCharacter,
  pickStage,
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
        <PageHeading icon={Swords} title={lang === "es" ? "Sala" : "Lobby"} />
        <ActivityLine inMatch={activity.inMatch} matched={false} isWaiting={false} poll={false} lang={lang} />
        <p className="mt-2 text-sm text-muted-foreground">
          {lang === "es"
            ? "Inicia sesión con Discord (arriba a la derecha) para unirte a la sala de emparejamiento."
            : "Sign in with Discord (top right) to join the matchmaking lobby."}
        </p>
      </main>
    );
  }

  await retryPairForWaitingUser(session.user.id);
  const entry = await getActiveLobbyEntry(session.user.id);
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { region: true, queueCooldownUntil: true, audioPingOnMatch: true, matchFoundSound: true },
  });
  // Region is required to queue (see joinLobbyAndTryPair), so the Lobby states
  // that up front and points at the settings card instead of letting the Find
  // Match button fail server-side with an error message.
  const hasRegion = Boolean(me?.region);
  const queueCooldownUntil = me?.queueCooldownUntil?.toISOString() ?? null;
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
  // The queue + settings stack only makes sense with no live match to focus on;
  // once a match ends it comes back below the results panel.
  const showQueueArea = !isInActiveMatch;

  return (
    <main className={`mx-auto w-full px-6 py-16 ${showMatchPanel ? "max-w-5xl" : "max-w-3xl"}`}>
      <PageHeading icon={Swords} title={lang === "es" ? "Sala" : "Lobby"} />
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
        audioPingOnMatch={audioPingOnMatch}
        matchFoundSound={matchFoundSound}
        lang={lang}
      />
      <PushNudgeBanner lang={lang} />

      {showMatchPanel && entry?.match && <PairedView userId={session.user.id} match={entry.match} lang={lang} />}

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
                      {lang === "es" ? "Buscando rival…" : "Searching for an opponent…"}
                    </CardTitle>
                    <CardDescription className="mt-0.5">
                      {lang === "es" ? "Activa las notificaciones en " : "Turn on notifications in "}
                      <Link
                        href="/settings#push-notifications"
                        className="text-foreground underline underline-offset-2"
                      >
                        {lang === "es" ? "Ajustes" : "Settings"}
                      </Link>
                      {lang === "es" ? " para no perderte la partida." : " so you don't miss the match."}
                    </CardDescription>
                  </div>
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="size-3.5" />
                    {lang === "es" ? "En cola" : "In queue"}
                    <span className="font-medium tabular-nums text-foreground">
                      <QueueTimer joinedAt={entry.joinedAt.toISOString()} />
                    </span>
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <form action={cancelLobby}>
                  <Button type="submit" variant="outline">
                    {lang === "es" ? "Cancelar búsqueda" : "Cancel search"}
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
                      {lang === "es"
                        ? "¿La espera se siente larga? Invita a un amigo para emparejarte más rápido."
                        : "Wait feeling long? Invite a friend to get matched faster."}
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
                        ? lang === "es"
                          ? "¿Listo para otra partida?"
                          : "Ready for another match?"
                        : lang === "es"
                          ? "¿Listo para jugar?"
                          : "Ready to play?"}
                    </CardTitle>
                    <CardDescription className="mt-0.5">
                      {lang === "es"
                        ? "Entra en la cola y te emparejaremos con un rival cercano."
                        : "Join the queue and we'll pair you with a nearby opponent."}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {!hasRegion && (
                  <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-muted-foreground">
                      {lang === "es" ? (
                        <>
                          Elige tu <span className="font-medium text-foreground">región de partida</span> en los ajustes
                          de abajo para poder buscar partida.{" "}
                          <a
                            href="#match-settings"
                            className="font-medium text-foreground underline underline-offset-2"
                          >
                            Elegir región ↓
                          </a>
                        </>
                      ) : (
                        <>
                          Choose your <span className="font-medium text-foreground">match region</span> in the settings
                          below to start matching.{" "}
                          <a
                            href="#match-settings"
                            className="font-medium text-foreground underline underline-offset-2"
                          >
                            Set region ↓
                          </a>
                        </>
                      )}
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
                  <CardTitle className="text-base">{lang === "es" ? "Ajustes de partida" : "Match settings"}</CardTitle>
                  <CardDescription className="mt-0.5">
                    {lang === "es" ? "Con quién te emparejamos y cómo." : "Who you match with, and how."}
                  </CardDescription>
                </div>
                {isWaiting && (
                  <Badge variant="outline" className="shrink-0">
                    <Lock className="size-3" />
                    {lang === "es" ? "Bloqueados" : "Locked"}
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
  audioPingOnMatch = true,
  matchFoundSound = "CHIME",
  lang,
}: {
  inMatch: number;
  matched: boolean;
  isWaiting: boolean;
  poll: boolean;
  audioPingOnMatch?: boolean;
  matchFoundSound?: MatchFoundSound;
  lang: Lang;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
      <Users className="size-3.5" />
      <span className="tabular-nums">
        {lang === "es" ? (
          <>
            <span className="font-medium text-foreground">{inMatch}</span> jugando ahora
          </>
        ) : (
          <>
            <span className="font-medium text-foreground">{inMatch}</span> playing now
          </>
        )}
      </span>
      {poll && (
        <LobbyPoller
          matched={matched}
          keepPollingInBackground={isWaiting}
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
      await updateRegion(String(formData.get("region") ?? ""));
      const distance = String(formData.get("maxMatchDistanceKm") ?? "");
      await updateMaxMatchDistance(distance === WORLDWIDE_VALUE ? null : Number(distance));
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

  const missingRegion = !me?.region;

  return (
    <MatchSettingsForm action={action} className="flex flex-col gap-6" lang={lang} disabled={disabled}>
      {disabled && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {lang === "es"
            ? "Estás en la cola, así que estos ajustes están bloqueados — cancela la búsqueda para cambiarlos."
            : "You're in the queue, so these settings are locked — cancel your search to change them."}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="flex items-center gap-1.5">
            {lang === "es" ? "Región de partida" : "Match region"}
            {missingRegion && <Badge variant="warning">{lang === "es" ? "Requerido" : "Required"}</Badge>}
          </span>
          <OptionSelect
            key={me?.region ?? ""}
            name="region"
            defaultValue={me?.region ?? ""}
            placeholder={lang === "es" ? "Sin definir" : "Not set"}
            clearLabel={lang === "es" ? "Sin definir" : "Not set"}
            className="w-full"
            searchable
            autoSubmit
            searchPlaceholder={lang === "es" ? "Buscar regiones…" : "Search regions…"}
            disabled={disabled}
            options={REGION_OPTIONS}
          />
        </label>

        <MatchSettingSelect
          name="maxMatchDistanceKm"
          label={lang === "es" ? "Distancia de partida" : "Match distance"}
          defaultValue={String(me?.maxMatchDistanceKm ?? WORLDWIDE_VALUE)}
          resetKey={String(me?.maxMatchDistanceKm ?? WORLDWIDE_VALUE)}
          disabled={disabled}
          options={MATCH_DISTANCE_PRESETS.map((preset) => ({
            value: String(preset.km ?? WORLDWIDE_VALUE),
            label: preset.label,
          }))}
        />

        <MatchSettingSelect
          name="maxRatingGap"
          label={lang === "es" ? "Diferencia de clasificación" : "Rating gap"}
          defaultValue={String(me?.maxRatingGap ?? ANY_RATING_VALUE)}
          resetKey={String(me?.maxRatingGap ?? ANY_RATING_VALUE)}
          disabled={disabled}
          options={MATCH_RATING_GAP_PRESETS.map((preset) => ({
            value: String(preset.gap ?? ANY_RATING_VALUE),
            label: preset.label,
          }))}
        />

        <MatchSettingSelect
          name="rematchCooldownHours"
          label={lang === "es" ? "Espera de revancha" : "Rematch cooldown"}
          defaultValue={String(me?.rematchCooldownHours ?? ANYTIME_VALUE)}
          resetKey={String(me?.rematchCooldownHours ?? ANYTIME_VALUE)}
          disabled={disabled}
          options={REMATCH_COOLDOWN_PRESETS.map((preset) => ({
            value: String(preset.hours ?? ANYTIME_VALUE),
            label: preset.label,
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
            {lang === "es" ? "En una conexión por cable (LAN)" : "On a wired (LAN) connection"}
          </label>
          {/* Kept outside the label so clicking the link doesn't toggle the box. */}
          <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
            {lang === "es" ? (
              <>
                Se desactiva solo si tus cancelaciones superan el 25% de tus cancelaciones más partidas jugadas, o si
                suficientes rivales reportan un problema de conexión contigo — consulta las{" "}
                <Link href="/rules" className="text-foreground underline underline-offset-2">
                  Reglas
                </Link>
                .
              </>
            ) : (
              <>
                Auto-clears if your cancels pass 25% of cancels plus games played, or if enough opponents report a
                connection issue with you — see the{" "}
                <Link href="/rules" className="text-foreground underline underline-offset-2">
                  Rules
                </Link>
                .
              </>
            )}
          </p>
        </div>

        <MatchSettingToggle
          name="requireWiredOpponent"
          checked={me?.requireWiredOpponent ?? false}
          label={lang === "es" ? "Solo rivales por cable" : "Only match with wired opponents"}
          disabled={disabled}
        />
        <MatchSettingToggle
          name="avoidPracticeOpponents"
          checked={me?.avoidPracticeOpponents ?? false}
          label={
            lang === "es" ? "Evitar rivales que están practicando" : "Don't match me with opponents who are practicing"
          }
          disabled={disabled}
        />
        <MatchSettingToggle
          name="zenMode"
          checked={me?.zenMode ?? false}
          label={lang === "es" ? "Modo Zen" : "Zen Mode"}
          hint={
            lang === "es"
              ? "Oculta la clasificación, el nombre, los personajes y el avatar de tu rival."
              : "Hide your opponent's rating, name, characters, and avatar."
          }
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
async function PairedView({ userId, match, lang }: { userId: string; match: Match; lang: Lang }) {
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
      practiceRating: true,
      region: true,
    },
  });
  const zenMode = me?.zenMode ?? false;
  const displayName = zenMode ? (lang === "es" ? "Rival" : "Opponent") : opponent.username;
  // Doesn't hide the opponent's real name/rating from them (that's what
  // zenMode above does, one-directionally) — just lets them know you have
  // it on, so they're not confused if you're less chatty/less findable.
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
        zenMode={zenMode}
        lang={lang}
      />
    );
    return (
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          {match.status === "CONFIRMED" ? (
            <ConfirmedSection userId={userId} match={match} lang={lang} />
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
                  {lang === "es" ? "Salir" : "Leave"}
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
              {lang === "es"
                ? "Ver todos los detalles de la partida en tu perfil →"
                : "View full match details on your profile →"}
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
  // only). Skipped in zen mode — like the streak badge, it would give away
  // who the masked opponent is.
  const headToHead = zenMode ? null : await getHeadToHead(userId, opponent.id);
  // Once any game's been decided or reported, cancelMatch is blocked
  // outright (see its gameInProgress check) — surrenderMatch isn't, so the
  // button always means "surrender" from that point on, no need to spend a
  // query re-checking opponent engagement.
  const gameDecided = games.some((g) => g.winnerId !== null || g.reportedById !== null);
  const opponentEngaged = gameDecided ? true : await hasOpponentEngaged(match.id, opponent.id, match.roomCodeSetById);

  const chat = (
    <CommentsSection
      userId={userId}
      match={match}
      opponentName={displayName}
      opponentHasLeft={!!opponentLeftAt}
      zenMode={zenMode}
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
        opponentStreak={opponentStreak}
        opponentInZenMode={opponentInZenMode}
        opponentIsPracticing={opponentIsPracticing}
        zenMode={zenMode}
        headToHead={headToHead}
        topCharacters={topCharacters}
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
                    {lang === "es"
                      ? `⚠️ El juego ${g.gameNumber} está en disputa y espera revisión de un mod. La partida puede continuar.`
                      : `⚠️ Game ${g.gameNumber} is disputed and awaiting mod review. The set can continue.`}
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
                  {lang === "es"
                    ? `⚠️ Tú y ${displayName} reportaron resultados distintos en el juego ${g.gameNumber}. Vuelve a reportar para confirmar, o disputa para que un mod lo revise.`
                    : `⚠️ You and ${displayName} reported different results for Game ${g.gameNumber}. Re-report to confirm, or dispute it for a mod to review.`}
                </p>
                <div className="mt-2 flex gap-2">
                  <ConfirmSubmitButton
                    action={reportGame.bind(null, match.id, g.gameNumber, true)}
                    confirmMessage={
                      lang === "es"
                        ? `¿Confirmar que ganaste el juego ${g.gameNumber}?`
                        : `Confirm that you won game ${g.gameNumber}?`
                    }
                    variant="success"
                  >
                    {lang === "es" ? "Gané" : "I Won"}
                  </ConfirmSubmitButton>
                  <ConfirmSubmitButton
                    action={reportGame.bind(null, match.id, g.gameNumber, false)}
                    confirmMessage={
                      lang === "es"
                        ? `¿Confirmar que perdiste el juego ${g.gameNumber}?`
                        : `Confirm that you lost game ${g.gameNumber}?`
                    }
                    variant="destructive"
                  >
                    {lang === "es" ? "Perdí" : "I Lost"}
                  </ConfirmSubmitButton>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {(() => {
                    if (lang === "es") {
                      if (myConfirmed && oppConfirmed) {
                        return "Ambos confirmaron. Un mod revisará este juego.";
                      }
                      if (myConfirmed) {
                        return `Confirmaste. Esperando a ${displayName}.`;
                      }
                      if (oppConfirmed) {
                        return `${displayName} confirmó. Confirma el tuyo para terminar.`;
                      }
                      return "Reportar el resultado opuesto le da el juego a tu rival.";
                    }
                    if (myConfirmed && oppConfirmed) {
                      return "You both confirmed. A mod will review this game.";
                    }
                    if (myConfirmed) {
                      return `You confirmed. Waiting for ${displayName}.`;
                    }
                    if (oppConfirmed) {
                      return `${displayName} confirmed. Confirm yours to finish.`;
                    }
                    return "Reporting the opposite result gives your opponent the game.";
                  })()}
                </p>
                <form action={disputeGame.bind(null, match.id, g.gameNumber)} className="mt-2">
                  <Button type="submit" variant="outline" size="sm">
                    {lang === "es" ? "Disputar este juego" : "Dispute this game"}
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
                {lang === "es"
                  ? `Tú y ${displayName} reportaron resultados distintos. Un mod revisará esta partida.`
                  : `You and ${displayName} reported different results. A mod will review this match.`}
              </p>
            </CardContent>
          )}

          {(match.status === "PENDING_REPORT" || match.status === "REPORTED") && (
            <MatchFooterActions
              match={match}
              isPlayer1={isPlayer1}
              opponentName={displayName}
              opponentEngaged={opponentEngaged}
              gameDecided={gameDecided}
              alreadyReportedConnection={alreadyReportedConnection}
              lang={lang}
            />
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
    <CardContent className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {lang === "es"
            ? gameDecided
              ? `Ya se decidió un juego, así que salir ahora cuenta como rendición (una derrota). Si ${opponentName} deja de responder, no necesitas rendirte: pierde su turno por abandono tras unos minutos, o el set completo si nunca elige personaje.`
              : opponentEngaged
                ? `${opponentName} ya empezó esta partida, así que salir ahora cuenta como rendición (una derrota), no como cancelación gratis.`
                : `${opponentName} aún no se presenta. Cancelar ahora es gratis.`
            : gameDecided
              ? `A game is already decided, so leaving now counts as a surrender (a loss). If ${opponentName} goes quiet, you don't need to surrender: they forfeit their turn after a few minutes, or the whole set if it's a character pick they never lock in.`
              : opponentEngaged
                ? `${opponentName} already started this match, so leaving now counts as a surrender (a loss), not a free cancel.`
                : `${opponentName} hasn't shown up yet. Cancelling now is free.`}
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
          {lang === "es"
            ? "¿No pueden terminar? Ambos pueden acordar cancelar. Sin afectar la clasificación."
            : "Can't finish? Both players can agree to cancel. No rating impact."}
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
          {lang === "es" ? "¿Lag o desconexiones?" : "Lag or disconnects?"}
        </p>
        {alreadyReportedConnection ? (
          <Button size="sm" variant="outline" disabled className="gap-1.5">
            <Check className="h-3.5 w-3.5" />
            {lang === "es" ? "Conexión reportada" : "Connection reported"}
          </Button>
        ) : (
          <form action={reportConnection.bind(null, match.id)}>
            <Button type="submit" size="sm" variant="outline">
              {lang === "es" ? "Reportar conexión" : "Report connection"}
            </Button>
          </form>
        )}
      </div>
    </CardContent>
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
  | { kind: "pick-character"; gameNumber: number; mine: boolean; deadlineIso: string | null }
  | {
      kind: "stage";
      gameNumber: number;
      phase: "striking" | "picking";
      mine: boolean;
      strikeCount: number;
      deadlineIso: string;
    }
  | { kind: "report-game"; gameNumber: number; mine: boolean; deadlineIso: string | null }
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
      return { kind: "contest", gameNumber: lastGame.gameNumber, escalated: !!lastGame.disputeRequestedAt };
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
    return { kind: "pick-character", gameNumber, mine: false, deadlineIso: null };
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
  opponentStreak,
  opponentInZenMode,
  opponentIsPracticing,
  zenMode,
  headToHead,
  topCharacters,
}: {
  games: MatchGameRow[];
  userId: string;
  opponentName: string;
  lang: Lang;
  me: {
    username: string;
    avatarUrl: string | null;
    rating: number;
    practiceRating: number;
    region: string | null;
  } | null;
  myIsPracticing: boolean;
  opponent: {
    id: string;
    username: string;
    avatarUrl: string | null;
    rating: number;
    practiceRating: number;
    region: string | null;
  };
  opponentStreak: number;
  opponentInZenMode: boolean;
  opponentIsPracticing: boolean;
  zenMode: boolean;
  headToHead: Awaited<ReturnType<typeof getHeadToHead>>;
  topCharacters: string[];
}) {
  const wins = { me: 0, opponent: 0 };
  for (const g of games) {
    if (g.winnerId === userId) wins.me++;
    else if (g.winnerId) wins.opponent++;
  }
  // Same "current playable game" rule the action section below uses, so the
  // pulsing pip always lines up with whatever GameSection is showing.
  const currentGame = games.find((g) => !g.winnerId && !isDisputedGame(g));
  const es = lang === "es";

  // Practice sets are rated off practiceRating, not the main ladder rating —
  // showing the main number here is what made players think they were still
  // on the main ladder (see #115).
  const myRating = myIsPracticing ? me?.practiceRating : me?.rating;
  const opponentRating = opponentIsPracticing ? opponent.practiceRating : opponent.rating;

  const labels: string[] = [];
  const pips = Array.from({ length: SET_GAME_COUNT }, (_, i) => {
    const gameNumber = i + 1;
    const game = games[i]; // rows are ordered ascending by gameNumber
    const decided = game?.winnerId ? (game.winnerId === userId ? "won" : "lost") : null;
    const inProgress = currentGame?.gameNumber === gameNumber;
    const label = decided
      ? decided === "won"
        ? es
          ? `Juego ${gameNumber} — lo ganaste`
          : `Game ${gameNumber} — you won`
        : es
          ? `Juego ${gameNumber} — lo perdiste`
          : `Game ${gameNumber} — you lost`
      : inProgress
        ? es
          ? `Juego ${gameNumber} — en curso`
          : `Game ${gameNumber} — in progress`
        : es
          ? `Juego ${gameNumber} — pendiente`
          : `Game ${gameNumber} — upcoming`;
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
        {/* You — left edge */}
        <div className="flex min-w-0 items-center gap-3 sm:flex-1">
          {me?.avatarUrl && (
            <Image src={me.avatarUrl} alt={me.username} width={40} height={40} className="shrink-0 rounded-full" />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{es ? "Tú" : "You"}</p>
            {!zenMode && (
              <p className="truncate text-sm text-muted-foreground tabular-nums">
                {es ? `${myRating} de clasificación` : `${myRating} rating`}
                {myIsPracticing && (es ? " (práctica)" : " (practice)")}
              </p>
            )}
            {(myIsPracticing || me?.region) && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {myIsPracticing && <Badge variant="outline">{es ? "🧪 Modo práctica" : "🧪 Practice Mode"}</Badge>}
                {me?.region && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />
                    {me.region}
                  </span>
                )}
              </p>
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
              {!zenMode ? (
                <Link href={`/players/${opponent.id}`} prefetch={false} className="truncate hover:underline">
                  {opponentName}
                </Link>
              ) : (
                <span className="truncate">{opponentName}</span>
              )}
              {!zenMode && opponentStreak > 0 && (
                <Badge variant="success" className="tabular-nums">
                  {es ? `${opponentStreak} victorias seguidas` : `${opponentStreak} win streak`}
                </Badge>
              )}
              {opponentInZenMode && <Badge variant="outline">{es ? "🧘 Modo Zen" : "🧘 Zen Mode"}</Badge>}
              {opponentIsPracticing && <Badge variant="outline">{es ? "Practicando" : "Practicing"}</Badge>}
            </p>
            {(!zenMode || opponent.region) && (
              <p className="flex flex-wrap items-center justify-end gap-2 text-sm text-muted-foreground tabular-nums">
                {!zenMode && (
                  <span>
                    {es ? `${opponentRating} de clasificación` : `${opponentRating} rating`}
                    {opponentIsPracticing && (es ? " (práctica)" : " (practice)")}
                  </span>
                )}
                {opponent.region && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />
                    {opponent.region}
                  </span>
                )}
              </p>
            )}
            {!zenMode && (
              <p className="text-xs tabular-nums text-muted-foreground">
                {headToHead ? (
                  <>
                    {es ? "Tu récord: " : "Your record: "}
                    {headToHead.wins}W–{headToHead.losses}L
                  </>
                ) : es ? (
                  "Primera vez que se enfrentan"
                ) : (
                  "First time opponent"
                )}
              </p>
            )}
            {!zenMode && topCharacters.length > 0 && (
              <div className="group/characters relative mt-1 flex items-center justify-end gap-1.5">
                <span className="pointer-events-none absolute -top-6 right-0 z-10 rounded border border-border bg-popover px-1.5 py-0.5 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover/characters:opacity-100">
                  {es ? "Personajes más usados" : "Most played characters"}
                </span>
                {topCharacters.map((character) => (
                  <CharacterIcon key={character} name={character} size={20} />
                ))}
              </div>
            )}
          </div>
          {!zenMode && opponent.avatarUrl && (
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
  const es = lang === "es";

  let tone: "action" | "waiting";
  let kicker: React.ReactNode = null;
  let title: React.ReactNode;
  let detail: React.ReactNode = null;
  let deadlineIso: string | null = null;
  let largeCountdown = false;

  switch (summary.kind) {
    case "start-game": {
      tone = "action";
      kicker = es ? "Tu turno" : "Your turn";
      title = es ? `Empieza el juego ${summary.gameNumber}` : `Start Game ${summary.gameNumber}`;
      detail = es ? "Presiona el botón de abajo para empezar." : "Press the button below to start.";
      break;
    }
    case "pick-character": {
      if (summary.mine) {
        tone = "action";
        kicker = es ? "Tu turno" : "Your turn";
        title = es
          ? `Elige tu personaje para el juego ${summary.gameNumber}`
          : `Pick your character for Game ${summary.gameNumber}`;
        detail = es
          ? "Ambos eligen personaje primero, luego el escenario."
          : "Both players pick a character first, then the stage.";
        deadlineIso = summary.deadlineIso;
        largeCountdown = true;
      } else {
        tone = "waiting";
        title = es
          ? `Esperando a que ${opponentName} elija personaje…`
          : `Waiting for ${opponentName} to pick a character…`;
        deadlineIso = summary.deadlineIso;
        if (!deadlineIso) {
          detail = es ? "Elegirás después de que elija." : "You'll pick after they lock in.";
        }
      }
      break;
    }
    case "stage": {
      if (summary.mine) {
        tone = "action";
        kicker = es ? "Tu turno" : "Your turn";
        title =
          summary.phase === "striking"
            ? es
              ? `Descarta ${summary.strikeCount} ${summary.strikeCount === 1 ? "escenario" : "escenarios"} para el juego ${summary.gameNumber}`
              : `Strike ${summary.strikeCount} ${summary.strikeCount === 1 ? "stage" : "stages"} for Game ${summary.gameNumber}`
            : es
              ? `Elige el escenario del juego ${summary.gameNumber}`
              : `Pick the stage for Game ${summary.gameNumber}`;
        detail = es ? "Si el tiempo se agota, se elige solo." : "If time runs out, it picks for you.";
        deadlineIso = summary.deadlineIso;
        largeCountdown = true;
      } else {
        tone = "waiting";
        title =
          summary.phase === "striking"
            ? es
              ? `Esperando a que ${opponentName} descarte para el juego ${summary.gameNumber}…`
              : `Waiting for ${opponentName} to strike for Game ${summary.gameNumber}…`
            : es
              ? `Esperando a que ${opponentName} elija el escenario del juego ${summary.gameNumber}…`
              : `Waiting for ${opponentName} to pick the stage for Game ${summary.gameNumber}…`;
        deadlineIso = summary.deadlineIso;
      }
      break;
    }
    case "report-game": {
      if (summary.mine) {
        tone = "action";
        kicker = es ? "Tu turno" : "Your turn";
        if (summary.deadlineIso) {
          title = es
            ? `${opponentName} reportó el juego ${summary.gameNumber} — confírmalo o dispútalo.`
            : `${opponentName} reported Game ${summary.gameNumber} — confirm or dispute it.`;
        } else {
          title = es
            ? `Reporta el resultado del juego ${summary.gameNumber}`
            : `Report Game ${summary.gameNumber}'s result`;
          detail = es ? "Cada quien reporta su propio resultado." : "Each player reports their own result.";
        }
        deadlineIso = summary.deadlineIso;
        largeCountdown = !!summary.deadlineIso;
      } else {
        tone = "waiting";
        title = es
          ? `Esperando a que ${opponentName} confirme el resultado…`
          : `Waiting for ${opponentName} to confirm the result…`;
        deadlineIso = summary.deadlineIso;
      }
      break;
    }
    case "contest": {
      tone = "waiting";
      title = summary.escalated
        ? es
          ? `Un mod está revisando el juego ${summary.gameNumber}.`
          : `A mod is reviewing Game ${summary.gameNumber}.`
        : es
          ? `El resultado del juego ${summary.gameNumber} está en disputa. Resuélvelo abajo.`
          : `Game ${summary.gameNumber}'s result is disputed. Resolve it below.`;
      break;
    }
    case "match-disputed": {
      tone = "waiting";
      title = es ? "Un mod está revisando esta partida." : "A mod is reviewing this match.";
      detail = es
        ? "No hay nada que hacer por ahora. Te avisaremos cuando se resuelva."
        : "Nothing to do for now. We'll notify you when it's resolved.";
      break;
    }
    case "waiting": {
      tone = "waiting";
      title = es ? "Esperando a tu rival…" : "Waiting on your opponent…";
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
            <p className="mt-1 text-[11px] text-muted-foreground">{es ? "tiempo restante" : "time left"}</p>
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
            {lang === "es" ? (
              <>
                {lastGame.disputeRequestedAt
                  ? `El juego ${lastGame.gameNumber} está en disputa. Un mod lo resolverá.`
                  : `Tú y tu rival reportaron resultados distintos en el juego ${lastGame.gameNumber}. Confírmalo o dispútalo abajo.`}
                {lastGame.finalStage && ` Escenario: ${lastGame.finalStage}.`}
              </>
            ) : (
              <>
                {lastGame.disputeRequestedAt
                  ? `Game ${lastGame.gameNumber} is disputed. A mod will resolve it.`
                  : `You and your opponent reported different results for Game ${lastGame.gameNumber}. Confirm or dispute it below.`}
                {lastGame.finalStage && ` Stage: ${lastGame.finalStage}.`}
              </>
            )}
          </p>
        </CardContent>
      );
    }

    const gameNumber = games.length + 1;
    return (
      <CardContent className={cn("border-t border-border pt-4", INPUT_FOCUS)}>
        <p className="text-sm font-medium">
          {lang === "es"
            ? gameNumber === 1
              ? "Listo para elegir escenario"
              : `Juego ${gameNumber} — quien ganó el último juego descarta primero`
            : gameNumber === 1
              ? "Ready to pick a stage"
              : `Game ${gameNumber} — the last game's winner strikes first`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {lang === "es"
            ? `Presiona el botón de abajo para empezar con ${opponentName}. El sitio te guía turno por turno.`
            : `Press the button below to start with ${opponentName}. The site walks you through each turn.`}
        </p>
        <form action={beginFirstGame.bind(null, match.id)} className="mt-3">
          <Button type="submit" size="sm">
            {lang === "es" ? `Empezar el juego ${gameNumber} →` : `Start Game ${gameNumber} →`}
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
          <p className="text-sm text-muted-foreground">{lang === "es" ? "Escenario" : "Stage"}</p>
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
  const verbEs = turn.phase === "striking" ? "descartar" : "elegir";

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
    lang === "es"
      ? turn.phase === "striking"
        ? `descartar ${remainingStrikes} escenario${remainingStrikes === 1 ? "" : "s"}`
        : "elegir un escenario"
      : turn.phase === "striking"
        ? `${verb} ${remainingStrikes} stage${remainingStrikes === 1 ? "" : "s"}`
        : `${verb} a stage`;

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
          {lang === "es" ? `Juego ${current.gameNumber} — ` : `Game ${current.gameNumber} — `}
          {!bothLocked ? (
            lang === "es" ? (
              "La selección de escenario empieza cuando ambos elijan personaje."
            ) : (
              "Stage selection starts once you both pick a character."
            )
          ) : !myTurn ? (
            lang === "es" ? (
              <>
                Esperando a que {opponentName} {verbEs}… (
                <Countdown deadline={deadline} />s restantes)
              </>
            ) : (
              <>
                Waiting for {opponentName} to {verb}… (
                <Countdown deadline={deadline} />s left)
              </>
            )
          ) : lang === "es" ? (
            <>
              Tu turno — {turnDescription} (<Countdown deadline={deadline} />s restantes, o se elige solo).
            </>
          ) : (
            <>
              Your turn — {turnDescription} (<Countdown deadline={deadline} />s left, or it picks automatically).
            </>
          )}
        </p>
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
                {lang === "es" ? `Repetir escenario (${runItBackStage})` : `Run it back (${runItBackStage})`}
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
              {lang === "es" ? "Deshacer mi último descarte" : "Undo my last strike"}
            </Button>
          </form>
        )}
      </CardContent>
    </>
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
  // forfeits the whole game to whoever's opponent never locked in within this
  // window. Game 1 is a blind simultaneous pick on ONE clock shared by both
  // sides: it starts at the game's creation and a lock-in never restarts it,
  // so both players are always reading the same countdown and the second one
  // to pick doesn't get a fresh — or shorter — window. Games 2+ pick in order,
  // so pickGameCharacter does reset characterPickDeadline when actorA locks
  // in, giving actorB their own full window from their opponent's pick.
  const pickDeadline = new Date(game.characterPickDeadline.getTime());
  const secondsLeft = secondsUntil(pickDeadline);
  const deadline = pickDeadline.toISOString();

  if (yourCharacter && opponentCharacter) {
    const matchupNote = await getMatchupNote(userId, opponentCharacter);
    return (
      <CardContent className="border-t border-border pt-4">
        {matchupNote && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <NotebookPen className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary">
                {lang === "es" ? `Tu nota sobre ${opponentCharacter}` : `Your note on ${opponentCharacter}`}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{matchupNote}</p>
            </div>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {lang === "es" ? (
            <>
              Personajes — tú:{" "}
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
          ) : (
            <>
              Characters — you:{" "}
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
          )}
        </p>
      </CardContent>
    );
  }

  if (yourCharacter && !opponentCharacter) {
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          {lang === "es" ? (
            <>
              Elegiste{" "}
              <span className="font-medium text-foreground">
                <CharacterIcon name={yourCharacter} size={16} className="mr-1 inline align-[-0.25em]" />
                {characterLabel(yourCharacter, yourMoveset)}
              </span>
              . Esperando a que {opponentName} elija…{" "}
              {secondsLeft > 0 ? (
                <>
                  Ganas el set por abandono si no elige en <Countdown deadline={deadline} />
                  s.
                </>
              ) : (
                "Pasó el plazo. Esto debería resolverse a tu favor pronto."
              )}
            </>
          ) : (
            <>
              You picked{" "}
              <span className="font-medium text-foreground">
                <CharacterIcon name={yourCharacter} size={16} className="mr-1 inline align-[-0.25em]" />
                {characterLabel(yourCharacter, yourMoveset)}
              </span>
              . Waiting for {opponentName} to pick…{" "}
              {secondsLeft > 0 ? (
                <>
                  You win the set by forfeit if they don&apos;t pick in <Countdown deadline={deadline} />
                  s.
                </>
              ) : (
                "The deadline passed. This should resolve in your favor soon."
              )}
            </>
          )}
        </p>
      </CardContent>
    );
  }

  if (!canPickNow) {
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          {lang === "es"
            ? `Esperando a que ${opponentName} elija personaje primero.`
            : `Waiting for ${opponentName} to pick a character first.`}
        </p>
      </CardContent>
    );
  }

  return (
    <CardContent className={cn("border-t border-border pt-4", INPUT_FOCUS)}>
      <p className="text-sm text-muted-foreground">
        {lang === "es"
          ? game.gameNumber === 1
            ? "Elige tu personaje. Queda oculto hasta que ambos elijan."
            : opponentCharacter
              ? `${opponentName} eligió ${characterLabel(opponentCharacter, opponentMoveset)}. Elige tu personaje.`
              : "Elige tu personaje. Vas primero."
          : game.gameNumber === 1
            ? "Pick your character. It stays hidden until you both pick."
            : opponentCharacter
              ? `${opponentName} picked ${characterLabel(opponentCharacter, opponentMoveset)}. Pick your character.`
              : "Pick your character. You go first."}{" "}
        {secondsLeft > 0 ? (
          <span className="font-medium text-foreground">
            {lang === "es" ? (
              <>
                Tienes <Countdown deadline={deadline} />s para elegir o pierdes este set por abandono.
              </>
            ) : (
              <>
                You have <Countdown deadline={deadline} />s to pick or you forfeit this set.
              </>
            )}
          </span>
        ) : (
          <span className="font-medium text-destructive">
            {lang === "es"
              ? "Pasaste el plazo. Elige ahora o pierdes el set por abandono."
              : "You're past the deadline. Pick now or you forfeit the set."}
          </span>
        )}
      </p>
      {isPracticing && (
        <p className="mt-2 text-xs text-muted-foreground">
          {lang === "es"
            ? "Entraste en modo Práctica. Esta partida solo afecta tu clasificación de práctica."
            : "You queued as Practicing. This set only affects your practice rating."}
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
    statusLine =
      lang === "es" ? (
        <>
          Esperando a que {opponentName} confirme…{" "}
          {secondsLeft !== null && secondsLeft > 0 ? (
            <>
              Se confirma solo en <Countdown deadline={deadline!} />
              s.
            </>
          ) : (
            "Pasó el plazo. Esto debería resolverse a tu favor pronto."
          )}
        </>
      ) : (
        <>
          Waiting for {opponentName} to confirm…{" "}
          {secondsLeft !== null && secondsLeft > 0 ? (
            <>
              It auto-confirms in <Countdown deadline={deadline!} />
              s.
            </>
          ) : (
            "The deadline passed. This should resolve in your favor soon."
          )}
        </>
      );
  } else if (game.reportedById) {
    statusLine =
      lang === "es" ? (
        <>
          {game.reportedWinnerId === userId
            ? `${opponentName} reportó que ganaste.`
            : `${opponentName} reportó que ganó.`}{" "}
          {secondsLeft !== null && secondsLeft > 0 && (
            <>
              Confirma o disputa antes de <Countdown deadline={deadline!} />
              s.
            </>
          )}
        </>
      ) : (
        <>
          {game.reportedWinnerId === userId
            ? `${opponentName} reported that you won.`
            : `${opponentName} reported that they won.`}{" "}
          {secondsLeft !== null && secondsLeft > 0 && (
            <>
              Confirm or dispute within <Countdown deadline={deadline!} />
              s.
            </>
          )}
        </>
      );
  }

  const body = (
    <>
      <p className="text-sm text-muted-foreground">
        {lang === "es"
          ? `Reporta el resultado del juego ${game.gameNumber} después de jugar. Si solo uno reporta, el otro tiene ${REPORT_TIMEOUT_MS / 60_000} minutos para confirmar o disputar. Pasado ese plazo, el reporte queda firme y el otro recibe un no-show.`
          : `Report Game ${game.gameNumber}'s result after you play. If only one player reports, the other has ${REPORT_TIMEOUT_MS / 60_000} minutes to confirm or dispute. After that, the report stands and the other player gets a no-show.`}
      </p>
      <div className="mt-4 flex gap-2">
        <ConfirmSubmitButton
          action={reportGame.bind(null, match.id, game.gameNumber, true)}
          confirmMessage={
            lang === "es"
              ? `¿Reportar que ganaste el juego ${game.gameNumber}?`
              : `Report that you won game ${game.gameNumber}?`
          }
          variant="success"
        >
          {lang === "es" ? "Gané" : "I Won"}
        </ConfirmSubmitButton>
        <ConfirmSubmitButton
          action={reportGame.bind(null, match.id, game.gameNumber, false)}
          confirmMessage={
            lang === "es"
              ? `¿Reportar que perdiste el juego ${game.gameNumber}?`
              : `Report that you lost game ${game.gameNumber}?`
          }
          variant="destructive"
        >
          {lang === "es" ? "Perdí" : "I Lost"}
        </ConfirmSubmitButton>
      </div>
      {statusLine && <p className="mt-4 text-sm text-muted-foreground">{statusLine}</p>}
    </>
  );

  return <CardContent className={cn("border-t border-border pt-4", needsMyReport && INPUT_FOCUS)}>{body}</CardContent>;
}

async function ConfirmedSection({ userId, match, lang }: { userId: string; match: Match; lang: Lang }) {
  const won = match.reportedWinnerId === userId;
  const ratingBefore = match.player1Id === userId ? match.player1RatingBefore : match.player2RatingBefore;
  const ratingAfter = match.player1Id === userId ? match.player1RatingAfter : match.player2RatingAfter;
  const delta = (ratingAfter ?? 0) - (ratingBefore ?? 0);

  let celebration: React.ReactNode = null;
  if (won && ratingBefore !== null && ratingAfter !== null) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { gamesPlayed: true },
    });
    const gamesPlayed = me?.gamesPlayed ?? 10;
    const tierUp = didTierUp(ratingBefore, ratingAfter, gamesPlayed);
    const tier = getRankTier(ratingAfter, gamesPlayed);
    celebration = (
      <VictoryCelebration
        ratingBefore={ratingBefore}
        ratingAfter={ratingAfter}
        tierUp={tierUp}
        tierName={tier?.name}
        lang={lang}
      />
    );
  }

  return (
    <CardContent className="pt-4">
      {celebration ?? (
        <>
          <p className="text-sm font-medium">
            {lang === "es" ? "Partida confirmada — perdiste" : "Set confirmed — you lost"}
          </p>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            {ratingBefore} → {ratingAfter} ({delta >= 0 ? "+" : ""}
            {delta})
          </p>
        </>
      )}
    </CardContent>
  );
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
        {lang === "es"
          ? `${opponentName} se fue — revancha no disponible.`
          : `${opponentName} has left — rematch unavailable.`}
      </p>
    );
  }

  if (myRequestedAt) {
    if (opponentUnavailable) {
      return (
        <p className="text-xs text-muted-foreground">
          {lang === "es"
            ? `${opponentName} ya no está disponible — pasó a otra partida.`
            : `${opponentName} is no longer available — they've moved on to another match.`}
        </p>
      );
    }
    return (
      <p className="text-xs text-muted-foreground">
        {lang === "es"
          ? `Esperando a que ${opponentName} acepte la revancha…`
          : `Waiting for ${opponentName} to accept the rematch…`}
      </p>
    );
  }

  if (opponentUnavailable) {
    return (
      <p className="text-xs text-muted-foreground">
        {lang === "es"
          ? `${opponentName} ya no está disponible — pasó a otra partida.`
          : `${opponentName} is no longer available — they've moved on to another match.`}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {opponentRequestedAt && (
        <p className="text-xs text-muted-foreground">
          {lang === "es" ? `¡${opponentName} quiere revancha!` : `${opponentName} wants a rematch!`}
        </p>
      )}
      <form action={requestRematchAction.bind(null, matchId)}>
        <Button type="submit" variant="outline" size="sm">
          {lang === "es"
            ? opponentRequestedAt
              ? "Aceptar revancha"
              : "Pedir revancha"
            : opponentRequestedAt
              ? "Accept Rematch"
              : "Request Rematch"}
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
        {lang === "es" ? `Esperando a que ${opponentName} esté de acuerdo…` : `Waiting for ${opponentName} to agree…`}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {opponentRequestedAt && (
        <p className="text-xs text-muted-foreground">
          {lang === "es" ? `¡${opponentName} quiere cancelar!` : `${opponentName} wants to cancel!`}
        </p>
      )}
      <form action={requestMutualCancelAction.bind(null, matchId)}>
        <Button type="submit" variant="outline" size="sm">
          {lang === "es"
            ? opponentRequestedAt
              ? "Aceptar cancelación"
              : "Pedir cancelación"
            : opponentRequestedAt
              ? "Agree to Cancel"
              : "Request Cancel"}
        </Button>
      </form>
    </div>
  );
}

function TerminatedSection({ status, lang }: { status: "CANCELLED" | "EXPIRED"; lang: Lang }) {
  return (
    <CardContent className="pt-4">
      <p className="text-sm text-muted-foreground">
        {lang === "es"
          ? status === "CANCELLED"
            ? "Esta partida fue cancelada — sin afectar la clasificación."
            : "Nadie reportó un resultado a tiempo, así que esta partida expiró sin afectar la clasificación."
          : status === "CANCELLED"
            ? "This match was cancelled — no rating impact."
            : "Nobody reported a result in time, so this match expired with no rating impact."}
      </p>
    </CardContent>
  );
}

async function CommentsSection({
  userId,
  match,
  opponentName,
  opponentHasLeft,
  zenMode,
  lang,
}: {
  userId: string;
  match: Match;
  opponentName: string;
  opponentHasLeft: boolean;
  zenMode?: boolean;
  lang: Lang;
}) {
  const rawComments = await listMatchComments(userId, match.id);
  const opponentTyping = await isOpponentTyping(match.id, userId);
  const myQuickMessagesRaw = await prisma.user.findUnique({
    where: { id: userId },
    select: { quickMessages: true },
  });
  const myQuickMessages = resolveQuickMessages(myQuickMessagesRaw?.quickMessages ?? []);

  // Determine opponent's user id for zen mode — replace their name in chat
  const opponentId = match.player1Id === userId ? match.player2Id : match.player1Id;

  // Serialize dates to strings for the client component
  const comments = rawComments.map((c) => ({
    id: c.id,
    author: {
      username: zenMode && c.author.id === opponentId ? (lang === "es" ? "Rival" : "Opponent") : c.author.username,
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
            {lang === "es" ? `${opponentName} dejó el chat.` : `${opponentName} has left the chat.`}
          </p>
        )}
        <ChatMessages
          comments={comments}
          empty={
            <p className="mt-2 text-sm text-muted-foreground">
              {lang === "es" ? "Aún no hay mensajes." : "No messages yet."}
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
              (lang === "es" ? `${opponentName} está creando la sala…` : `${opponentName} is creating the room…`)}
          </FlashOnChange>
        </p>
        {initialValue && (
          <p className="text-xs text-muted-foreground">
            {lang === "es" ? "Definido por tu rival — únete con este." : "Set by your opponent — join with this."}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {lang === "es" ? (
            <>
              Contraseña: <span className="font-medium text-foreground">{hostArenaPassword}</span>.
            </>
          ) : (
            <>
              Password: <span className="font-medium text-foreground">{hostArenaPassword}</span>.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-foreground">
        {lang === "es" ? "Te toca crear la sala." : "You're creating the room."}
      </p>
      <RoomCodeForm initialValue={initialValue} action={submitRoomCode.bind(null, matchId)} lang={lang} />
      <p className="text-xs text-muted-foreground">
        {lang === "es" ? (
          <>
            Contraseña: <span className="font-medium text-foreground">{hostArenaPassword}</span> — este es tu valor por
            defecto, puedes{" "}
            <Link href="/settings" prefetch={false} className="underline hover:text-foreground">
              cambiarlo en Ajustes
            </Link>
            .
          </>
        ) : (
          <>
            Password: <span className="font-medium text-foreground">{hostArenaPassword}</span> — this is your default,
            you can{" "}
            <Link href="/settings" prefetch={false} className="underline hover:text-foreground">
              change it in Settings
            </Link>
            .
          </>
        )}
      </p>
    </div>
  );
}
