import Image from "next/image";
import Link from "next/link";
import { Check, Loader2, MapPin, NotebookPen, Swords, Users } from "lucide-react";
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
    select: { queueCooldownUntil: true, audioPingOnMatch: true, matchFoundSound: true },
  });
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

  return (
    <main className={`mx-auto w-full px-6 py-16 ${showMatchPanel ? "max-w-5xl" : "max-w-3xl"}`}>
      <PageHeading icon={Swords} title={lang === "es" ? "Sala" : "Lobby"} />
      <ActivityLine
        inMatch={activity.inMatch}
        matched={!!isInActiveMatch}
        isWaiting={entry?.status === "WAITING"}
        poll={shouldPollLobby({
          isInActiveMatch: !!isInActiveMatch,
          isWaiting: entry?.status === "WAITING",
          matchJustEnded: !!matchJustEnded,
          hasLeftMatch: !!myLeftAt,
        })}
        audioPingOnMatch={audioPingOnMatch}
        matchFoundSound={matchFoundSound}
        lang={lang}
      />
      <PushNudgeBanner lang={lang} />
      <SupporterBanner supporterCount={supporterCount} lang={lang} />

      {matchJustEnded && (
        <Card className="mt-4 border-primary/30">
          <CardContent className="pt-4">
            <p className="text-sm font-medium">
              {lang === "es" ? "¿Listo para otra partida?" : "Ready for another match?"}
            </p>
            <QueueCooldownGate cooldownUntil={queueCooldownUntil} lang={lang}>
              <JoinLobbyForm action={joinLobby} className="mt-3" lang={lang} />
            </QueueCooldownGate>
          </CardContent>
        </Card>
      )}

      {!entry && (
        <Card className="mt-4">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              {lang === "es" ? "No estás en la cola." : "You're not in the queue."}
            </p>
            <QueueCooldownGate cooldownUntil={queueCooldownUntil} lang={lang}>
              <JoinLobbyForm action={joinLobby} className="mt-4" lang={lang} />
            </QueueCooldownGate>
          </CardContent>
        </Card>
      )}

      {entry?.status === "WAITING" && (
        <Card className="mt-4">
          <CardContent className="flex items-center gap-3 pt-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {lang === "es" ? "Esperando a un rival…" : "Waiting for an opponent…"}
            </p>
            <span className="ml-auto text-sm tabular-nums text-muted-foreground">
              {lang === "es" ? "Tiempo en cola:" : "In queue:"} <QueueTimer joinedAt={entry.joinedAt.toISOString()} />
            </span>
          </CardContent>
          <CardContent className="pt-0">
            <form action={cancelLobby}>
              <Button type="submit" variant="outline">
                {lang === "es" ? "Cancelar" : "Cancel"}
              </Button>
            </form>
          </CardContent>
          <CardContent className="border-t border-border pt-3">
            <QueueRoomCodeForm
              initialValue={entry.existingRoomCode ?? ""}
              action={updateLobbyRoomCodeAction}
              lang={lang}
            />
          </CardContent>
          <CardContent className="border-t border-border pt-3">
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
          </CardContent>
        </Card>
      )}

      {!isInActiveMatch && (
        <Card className="mt-4">
          <CardContent className="pt-4">
            <MatchmakingForm userId={session.user.id} lang={lang} disabled={entry?.status === "WAITING"} />
          </CardContent>
        </Card>
      )}

      {showMatchPanel && entry?.match && <PairedView userId={session.user.id} match={entry.match} lang={lang} />}
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

const MATCH_STATUS_LABEL_ES: Record<string, string> = {
  PENDING_REPORT: "reporte pendiente",
  REPORTED: "reportado",
  DISPUTED: "en disputa",
  CONFIRMED: "confirmado",
  CANCELLED: "cancelado",
  EXPIRED: "expirado",
};

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

  return (
    <MatchSettingsForm action={action} className="flex flex-col gap-2" lang={lang} disabled={disabled}>
      {disabled && (
        <p className="text-xs text-muted-foreground">
          {lang === "es"
            ? "Los ajustes de emparejamiento están bloqueados mientras estás en la cola — cancela la búsqueda para cambiarlos."
            : "Matchmaking settings are locked while you're in queue — cancel your search to change them."}
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        {lang === "es" ? "Región de partida" : "Match region"}
        <span className="text-xs font-normal text-muted-foreground">
          {lang === "es"
            ? "Necesaria para entrar a la cola — el emparejamiento se basa en la distancia entre regiones, así que elige la que esté físicamente más cerca de ti, aunque no sea tu propio país. Other no tiene ubicación, así que solo empareja con otros jugadores Other."
            : "Required to queue — matching works off the distance between regions, so pick whichever is physically closest to you, even if it's not your own country. Other has no location, so it only ever matches other Other players."}
        </span>
        <OptionSelect
          key={me?.region ?? ""}
          name="region"
          defaultValue={me?.region ?? ""}
          placeholder={lang === "es" ? "Sin definir" : "Not set"}
          clearLabel={lang === "es" ? "Sin definir" : "Not set"}
          className="w-52"
          searchable
          searchPlaceholder={lang === "es" ? "Buscar regiones…" : "Search regions…"}
          disabled={disabled}
          options={REGION_OPTIONS}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {lang === "es" ? "Distancia de partida" : "Match distance"}
        <span className="text-xs font-normal text-muted-foreground">
          {lang === "es"
            ? "El emparejamiento requiere que el ajuste de distancia de AMBOS jugadores cubra la distancia real entre ellos — ampliar el tuyo no anula el del otro lado."
            : "Matching requires BOTH players' distance setting to cover the actual distance between them — widening yours doesn't override the other side's."}
        </span>
        <OptionSelect
          key={String(me?.maxMatchDistanceKm ?? WORLDWIDE_VALUE)}
          name="maxMatchDistanceKm"
          defaultValue={String(me?.maxMatchDistanceKm ?? WORLDWIDE_VALUE)}
          disabled={disabled}
          className="w-48"
          options={MATCH_DISTANCE_PRESETS.map((preset) => ({
            value: String(preset.km ?? WORLDWIDE_VALUE),
            label: preset.label,
          }))}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {lang === "es" ? "Diferencia de clasificación" : "Rating gap"}
        <span className="text-xs font-normal text-muted-foreground">
          {lang === "es"
            ? "El emparejamiento requiere que el ajuste de diferencia de clasificación de AMBOS jugadores cubra la diferencia real."
            : "Matching requires BOTH players' rating-gap setting to cover the actual difference in rating."}
        </span>
        <OptionSelect
          key={String(me?.maxRatingGap ?? ANY_RATING_VALUE)}
          name="maxRatingGap"
          defaultValue={String(me?.maxRatingGap ?? ANY_RATING_VALUE)}
          disabled={disabled}
          className="w-48"
          options={MATCH_RATING_GAP_PRESETS.map((preset) => ({
            value: String(preset.gap ?? ANY_RATING_VALUE),
            label: preset.label,
          }))}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {lang === "es" ? "Tiempo de espera para revancha" : "Rematch cooldown"}
        <span className="text-xs font-normal text-muted-foreground">
          {lang === "es"
            ? "El emparejamiento requiere que el tiempo de espera de AMBOS jugadores haya pasado desde la última vez que jugaron entre ustedes."
            : "Matching requires BOTH players' cooldown to have elapsed since you two last played."}
        </span>
        <OptionSelect
          key={String(me?.rematchCooldownHours ?? ANYTIME_VALUE)}
          name="rematchCooldownHours"
          defaultValue={String(me?.rematchCooldownHours ?? ANYTIME_VALUE)}
          disabled={disabled}
          className="w-48"
          options={REMATCH_COOLDOWN_PRESETS.map((preset) => ({
            value: String(preset.hours ?? ANYTIME_VALUE),
            label: preset.label,
          }))}
        />
      </label>
      <div className="mt-1 flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm">
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
        <span className="pl-6 text-xs text-muted-foreground">
          {lang === "es" ? (
            <>
              Se quita automáticamente (y no se puede volver a marcar hasta que se recupere) si tus cancelaciones
              superan el 25% de tus cancelaciones-más-partidas-jugadas, o si suficientes rivales reportan un problema de
              conexión contigo — ver la página de Reglas.
            </>
          ) : (
            <>
              Auto-clears (and can&apos;t be re-checked until it recovers) if your cancels pass 25% of your
              cancels-plus-games-played, or if enough opponents report a connection issue with you — see the Rules page.
            </>
          )}
        </span>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          key={String(me?.requireWiredOpponent ?? false)}
          type="checkbox"
          name="requireWiredOpponent"
          defaultChecked={me?.requireWiredOpponent ?? false}
          disabled={disabled}
          className="size-4 rounded border-border disabled:opacity-60"
        />
        {lang === "es" ? "Solo emparejar con rivales por cable" : "Only match with wired opponents"}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          key={String(me?.avoidPracticeOpponents ?? false)}
          type="checkbox"
          name="avoidPracticeOpponents"
          defaultChecked={me?.avoidPracticeOpponents ?? false}
          disabled={disabled}
          className="size-4 rounded border-border disabled:opacity-60"
        />
        {lang === "es"
          ? "No emparejarme con rivales que están practicando"
          : "Don't match me with opponents who are practicing"}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          key={String(me?.zenMode ?? false)}
          type="checkbox"
          name="zenMode"
          defaultChecked={me?.zenMode ?? false}
          disabled={disabled}
          className="size-4 rounded border-border disabled:opacity-60"
        />
        {lang === "es"
          ? "Modo Zen — oculta la clasificación, nombre, personajes y avatar del rival"
          : "Zen Mode — hide opponent's rating, name, characters, and avatar"}
      </label>
    </MatchSettingsForm>
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
    select: { zenMode: true, rating: true, practiceRating: true, region: true },
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

  const statusLabel =
    lang === "es" ? MATCH_STATUS_LABEL_ES[match.status] : match.status.replace("_", " ").toLowerCase();
  // Re-derived on every poll, like the rest of the match state below, so the
  // top-of-card banner always reflects the current turn/deadline.
  const matchAction = matchActionSummary(userId, match, games);

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <p className="badge-pop text-base font-semibold text-foreground">
              {lang === "es" ? "🎮 ¡Te han emparejado!" : "🎮 You've been matched!"}
            </p>
            <Badge variant="secondary">{statusLabel}</Badge>
          </div>
          <MatchScoreboard games={games} userId={userId} opponentName={displayName} lang={lang} />
        </CardHeader>
        <CardContent className="pt-0">
          <MatchActionBanner summary={matchAction} opponentName={displayName} lang={lang} />
        </CardContent>
        <CardContent className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground tabular-nums">
            <span>
              {lang === "es" ? "Tú:" : "You:"}
              {!zenMode &&
                (() => {
                  // Mirrors opponentIsPracticing's displayRating below — a
                  // practice set is rated off practiceRating, so showing the
                  // main rating here is what made players think they were
                  // still on the main ladder (see #115).
                  const myDisplayRating = myIsPracticing ? me?.practiceRating : me?.rating;
                  return (
                    <>
                      {lang === "es" ? ` ${myDisplayRating} de clasificación` : ` ${myDisplayRating} rating`}
                      {myIsPracticing && (lang === "es" ? " (práctica)" : " (practice)")}
                    </>
                  );
                })()}
            </span>
            {myIsPracticing && (
              <Badge variant="outline" className="ml-2">
                {lang === "es" ? "🧪 Modo práctica" : "🧪 Practice Mode"}
              </Badge>
            )}
            {me?.region && (
              <span className="ml-2 inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {me.region}
              </span>
            )}
          </p>
          <div className="flex items-center gap-3">
            {!zenMode && opponent.avatarUrl && (
              <Image src={opponent.avatarUrl} alt={opponent.username} width={40} height={40} className="rounded-full" />
            )}
            <div className={zenMode ? "flex-1" : ""}>
              <p className="flex items-center gap-1.5 font-medium">
                {!zenMode ? (
                  <Link href={`/players/${opponent.id}`} className="hover:underline">
                    {displayName}
                  </Link>
                ) : (
                  displayName
                )}
                {!zenMode && opponentStreak > 0 && (
                  <Badge variant="success" className="tabular-nums">
                    {lang === "es" ? `${opponentStreak} victorias seguidas` : `${opponentStreak} win streak`}
                  </Badge>
                )}
                {opponentInZenMode && <Badge variant="outline">{lang === "es" ? "🧘 Modo Zen" : "🧘 Zen Mode"}</Badge>}
                {opponentIsPracticing && (
                  <Badge variant="outline">{lang === "es" ? "Practicando" : "Practicing"}</Badge>
                )}
              </p>
              {(!zenMode || opponent.region) && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
                  {!zenMode &&
                    (() => {
                      // Practice sets are rated off practiceRating, not the
                      // main rating shown everywhere else — showing the main
                      // number here made the Elo swing after the set look
                      // wrong (a big rating gap that wasn't actually being
                      // used for this particular match).
                      const displayRating = opponentIsPracticing ? opponent.practiceRating : opponent.rating;
                      return (
                        <span>
                          {lang === "es" ? `${displayRating} de clasificación` : `${displayRating} rating`}
                          {opponentIsPracticing && (lang === "es" ? " (práctica)" : " (practice)")}
                        </span>
                      );
                    })()}
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
                      {lang === "es" ? "Tu récord: " : "Your record: "}
                      {headToHead.wins}W–{headToHead.losses}L
                    </>
                  ) : lang === "es" ? (
                    "Primera vez que se enfrentan"
                  ) : (
                    "First time opponent"
                  )}
                </p>
              )}
              {!zenMode && topCharacters.length > 0 && (
                <div className="group/characters relative mt-1 flex items-center gap-1.5">
                  <span className="pointer-events-none absolute -top-6 left-0 z-10 rounded border border-border bg-popover px-1.5 py-0.5 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover/characters:opacity-100">
                    {lang === "es" ? "Personajes más usados" : "Most played characters"}
                  </span>
                  {topCharacters.map((character) => (
                    <CharacterIcon key={character} name={character} size={20} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>

        <CardContent>
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

        {games.filter(isDisputedGame).map((g) => {
          if (g.disputeRequestedAt) {
            return (
              <CardContent key={g.id} className="border-t border-border pt-4">
                <p className="text-sm text-muted-foreground">
                  {lang === "es"
                    ? `⚠️ El resultado del juego ${g.gameNumber} está en disputa y a la espera de revisión por un mod — esto no bloquea el resto de la partida.`
                    : `⚠️ Game ${g.gameNumber}'s result is disputed and awaiting mod review — this doesn't block the rest of the set.`}
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
                  ? `⚠️ Tú y ${displayName} reportaron resultados distintos para el juego ${g.gameNumber}. Vuelve a reportar tu resultado para confirmarlo, o disputa el juego para que un mod lo revise.`
                  : `⚠️ You and ${displayName} reported different results for game ${g.gameNumber}. Re-report your result to confirm it, or dispute the game for a mod to review.`}
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
                      return "Ambos volvieron a confirmar sus reportes — este juego pasa a un mod.";
                    }
                    if (myConfirmed) {
                      return `Confirmaste tu reporte — esperando a que ${displayName} vuelva a confirmar o dispute.`;
                    }
                    if (oppConfirmed) {
                      return `${displayName} volvió a confirmar su reporte — confirma el tuyo para terminar de reconciliar.`;
                    }
                    return "Reportar el resultado opuesto al anterior resuelve el juego a favor de tu rival.";
                  }
                  if (myConfirmed && oppConfirmed) {
                    return "You've both re-confirmed your reports — this game is headed to a mod.";
                  }
                  if (myConfirmed) {
                    return `You've confirmed your report — waiting for ${displayName} to re-confirm or dispute.`;
                  }
                  if (oppConfirmed) {
                    return `${displayName} has re-confirmed their report — confirm yours to finish reconciling.`;
                  }
                  return "Reporting the opposite result from before resolves the game in your opponent's favor.";
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
            <CardContent key={g.id} className="border-t border-border pt-4">
              {myConfirmed ? body : <InputFocus>{body}</InputFocus>}
            </CardContent>
          );
        })}

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

        {match.status === "DISPUTED" && (
          <CardContent className="border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              {lang === "es"
                ? `Tú y ${displayName} reportaron resultados distintos. Esta partida está a la espera de revisión.`
                : `You and ${displayName} reported different results. This match is awaiting review.`}
            </p>
          </CardContent>
        )}

        {match.status === "PENDING_REPORT" || match.status === "REPORTED" ? (
          <MatchFooterActions
            match={match}
            isPlayer1={isPlayer1}
            opponentName={displayName}
            opponentEngaged={opponentEngaged}
            gameDecided={gameDecided}
            alreadyReportedConnection={alreadyReportedConnection}
            lang={lang}
          />
        ) : (
          <CardContent className="border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              {lang === "es"
                ? "Esta partida está a la espera de revisión por un mod."
                : "This match is awaiting mod review."}
            </p>
          </CardContent>
        )}
      </Card>

      {/* Chat card — side panel on desktop, below on mobile */}
      <div className="lg:order-none">{chat}</div>
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
              ? `Ya se decidió un juego en esta partida, así que retirarte ahora siempre cuenta como rendición (una derrota). Si ${opponentName} dejó de responder, no necesitas rendirte por ellos — un rival que no responde pierde automáticamente su turno después de unos minutos y la partida simplemente continúa.`
              : opponentEngaged
                ? `${opponentName} ya empezó esta partida, así que retirarte ahora cuenta como rendición (una derrota) en vez de una cancelación gratuita.`
                : `${opponentName} no se ha presentado aún — cancelar ahora es gratis.`
            : gameDecided
              ? `A game's already been decided in this set, so backing out now always counts as a surrender (a loss). If ${opponentName} has gone quiet, you don't need to surrender for them — an unresponsive opponent auto-forfeits their turn after a few minutes and the set just continues.`
              : opponentEngaged
                ? `${opponentName} has already started this match, so backing out now counts as a surrender (a loss) instead of a free cancel.`
                : `${opponentName} hasn't shown up yet — cancelling now is free.`}
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
            ? "¿No pueden terminar esta partida? Ambos lados pueden acordar cancelarla — sin afectar la clasificación."
            : "Can't finish this set? Both sides can agree to call it off — no rating impact."}
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
          {lang === "es"
            ? "¿Lag, muchos rollbacks, o desconexión durante esta partida?"
            : "Laggy, rollback-heavy, or disconnected during this match?"}
        </p>
        {alreadyReportedConnection ? (
          <Button size="sm" variant="outline" disabled className="gap-1.5">
            <Check className="h-3.5 w-3.5" />
            {lang === "es" ? "Conexión reportada" : "Connection reported"}
          </Button>
        ) : (
          <form action={reportConnection.bind(null, match.id)}>
            <Button type="submit" size="sm" variant="outline">
              {lang === "es" ? "Reportar conexión" : "Connection Report"}
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
      // Locked in yourself — the character-pick clock (reset when you locked
      // in, see pickGameCharacter) now belongs to the opponent.
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

// The header's match-progress strip: current set score plus one pip per game
// (best-of-5). Decided games are colored — emerald when you won, destructive
// when you lost; the playable game gets a pulsing ring; everything else stays
// muted. The legend below the pips spells out the win/loss color coding.
function MatchScoreboard({
  games,
  userId,
  opponentName,
  lang,
}: {
  games: MatchGameRow[];
  userId: string;
  opponentName: string;
  lang: Lang;
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-xl font-bold">{wins.me}</span>
        <span className="text-xs text-muted-foreground">–</span>
        <span className="text-xl font-bold">{wins.opponent}</span>
        <span className="ml-1.5 text-xs text-muted-foreground">
          {es ? "tú contra " : "you vs "}
          <span className="font-medium text-foreground">{opponentName}</span>
        </span>
      </p>
      <div className="flex flex-col items-end gap-1">
        {(() => {
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
            <div role="img" aria-label={labels.join(", ")} className="flex items-center gap-1.5">
              {pips}
            </div>
          );
        })()}
        <p className="text-[11px] text-muted-foreground">
          <span className="mr-2 inline-flex items-center gap-1">
            <span aria-hidden="true" className="size-2 rounded-full bg-emerald-500" />
            {es ? "ganados" : "won"}
          </span>
          <span className="mr-2 inline-flex items-center gap-1">
            <span aria-hidden="true" className="size-2 rounded-full bg-destructive" />
            {es ? "perdidos" : "lost"}
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="size-2 animate-pulse rounded-full bg-primary/25 ring-2 ring-primary/70"
            />
            {es ? "en curso" : "live"}
          </span>
        </p>
      </div>
    </div>
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
      title = (
        <>
          {es ? "Listo para empezar" : "Ready to start"} —{" "}
          {es ? `descarte del juego ${summary.gameNumber}` : `strike for Game ${summary.gameNumber}`}
        </>
      );
      detail = es
        ? "Presiona el botón de abajo cuando estén listos."
        : "Press the button below once you're both ready.";
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
          ? "La selección de escenario comienza cuando ambos personajes estén elegidos."
          : "Stage selection starts once you've both locked in.";
        deadlineIso = summary.deadlineIso;
        largeCountdown = true;
      } else {
        tone = "waiting";
        title = es
          ? `Esperando a que ${opponentName} elija su personaje para el juego ${summary.gameNumber}…`
          : `Waiting for ${opponentName} to pick their character for Game ${summary.gameNumber}…`;
        deadlineIso = summary.deadlineIso;
        if (!deadlineIso) {
          detail = es
            ? "Los personajes se eligen en orden — te tocará después."
            : "Picks happen in order — you'll be up once they lock in.";
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
              ? `Elige el escenario final del juego ${summary.gameNumber}`
              : `Pick the final stage for Game ${summary.gameNumber}`;
        detail = es ? "Si el tiempo se agota, se elige automáticamente." : "If time runs out, it auto-picks.";
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
              ? `Esperando a que ${opponentName} elija el escenario final del juego ${summary.gameNumber}…`
              : `Waiting for ${opponentName} to pick the final stage for Game ${summary.gameNumber}…`;
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
          detail = es
            ? "Nadie ha reportado todavía — cada quien reporta su propio resultado."
            : "Nobody has reported yet — each side reports their own result.";
        }
        deadlineIso = summary.deadlineIso;
        largeCountdown = !!summary.deadlineIso;
      } else {
        tone = "waiting";
        title = es
          ? `Esperando a que ${opponentName} confirme el resultado del juego ${summary.gameNumber}…`
          : `Waiting for ${opponentName} to confirm Game ${summary.gameNumber}'s result…`;
        deadlineIso = summary.deadlineIso;
      }
      break;
    }
    case "contest": {
      tone = "waiting";
      title = summary.escalated
        ? es
          ? `El resultado del juego ${summary.gameNumber} está bajo revisión de un mod.`
          : `Game ${summary.gameNumber}'s result is under mod review.`
        : es
          ? `El resultado del juego ${summary.gameNumber} está en disputa — resuélvelo arriba para continuar.`
          : `Game ${summary.gameNumber}'s result is disputed — resolve it above to keep the set moving.`;
      break;
    }
    case "match-disputed": {
      tone = "waiting";
      title = es ? "Esta partida está a la espera de revisión por un mod." : "This match is awaiting mod review.";
      detail = es
        ? "No hay nada que hacer por ahora — te avisaremos cuando se resuelva."
        : "Nothing to do for now — you'll be notified when it's resolved.";
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

// Soft primary callout for a section that's currently waiting on the current
// player's input — same visual language as the matchup-note box, so the part
// of the card that can actually advance the set is where the eyes land.
function InputFocus({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-3">{children}</div>;
}

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
                  ? `El resultado del juego ${lastGame.gameNumber} está en disputa — un mod lo resolverá.`
                  : `El resultado del juego ${lastGame.gameNumber} se está reconciliando — vuelve a confirmar tu reporte o disputa arriba.`}
                {lastGame.finalStage && ` El escenario fue ${lastGame.finalStage}.`}
              </>
            ) : (
              <>
                {lastGame.disputeRequestedAt
                  ? `Game ${lastGame.gameNumber}'s result is disputed — a mod will resolve it.`
                  : `Game ${lastGame.gameNumber}'s result is being reconciled — re-confirm your report or dispute it above.`}
                {lastGame.finalStage && ` Stage was ${lastGame.finalStage}.`}
              </>
            )}
          </p>
        </CardContent>
      );
    }

    const gameNumber = games.length + 1;
    return (
      <CardContent className="border-t border-border pt-4">
        <InputFocus>
          <p className="text-sm font-medium">
            {lang === "es"
              ? gameNumber === 1
                ? "Listo para elegir escenario"
                : `Juego ${gameNumber} — quien ganó el último juego descarta primero`
              : gameNumber === 1
                ? "Ready to pick a stage"
                : `Game ${gameNumber} — winner of the last game strikes first`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lang === "es"
              ? `Presiona el botón de abajo para empezar el descarte de escenario con ${opponentName} — esto no es algo para resolver por chat, el sitio te guía turno por turno.`
              : `Click the button below to start stage striking with ${opponentName} — this isn't something to sort out over chat, the site walks you through it turn by turn.`}
          </p>
          <form action={beginFirstGame.bind(null, match.id)} className="mt-3">
            <Button type="submit" size="sm">
              {lang === "es"
                ? `Empezar descarte de escenario del juego ${gameNumber} →`
                : `Start Game ${gameNumber} stage striking →`}
            </Button>
          </form>
        </InputFocus>
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
          <p className="text-sm text-muted-foreground">
            {lang === "es" ? `Escenario del juego ${current.gameNumber}` : `Game ${current.gameNumber} stage`}
          </p>
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
      <CardContent className="border-t border-border pt-4">
        <div className={cn(!canAct ? "" : "rounded-lg border border-primary/20 bg-primary/[0.03] p-3")}>
          <p className="text-sm text-muted-foreground">
            {lang === "es" ? `Juego ${current.gameNumber} — ` : `Game ${current.gameNumber} — `}
            {!bothLocked ? (
              lang === "es" ? (
                "La selección de escenario empezará cuando ambos personajes estén elegidos."
              ) : (
                "Stage selection will start once both characters are locked in."
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
                Tu turno — {turnDescription} (<Countdown deadline={deadline} />s restantes, o se elige automáticamente).
              </>
            ) : (
              <>
                Your turn — {turnDescription} (<Countdown deadline={deadline} />s left, or it auto-picks).
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
        </div>
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
  // window. Each player gets their own CHARACTER_TIMEOUT_MS window: it starts
  // at the game's creation for the first picker, and pickGameCharacter resets
  // it to now + CHARACTER_TIMEOUT_MS when the first player locks in — so the
  // second player's countdown restarts from their opponent's pick, not from
  // when the game was created.
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
              Personajes del juego {game.gameNumber} — tú:{" "}
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
              Game {game.gameNumber} characters — you:{" "}
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
              Juego {game.gameNumber} — elegiste{" "}
              <span className="font-medium text-foreground">
                <CharacterIcon name={yourCharacter} size={16} className="mr-1 inline align-[-0.25em]" />
                {characterLabel(yourCharacter, yourMoveset)}
              </span>
              . Esperando a que {opponentName} elija…{" "}
              {secondsLeft > 0 ? (
                <>
                  Ganas este juego por abandono si no lo hacen en <Countdown deadline={deadline} />
                  s.
                </>
              ) : (
                "Ya pasaron el plazo — esto debería resolverse a tu favor pronto."
              )}
            </>
          ) : (
            <>
              Game {game.gameNumber} — you locked in{" "}
              <span className="font-medium text-foreground">
                <CharacterIcon name={yourCharacter} size={16} className="mr-1 inline align-[-0.25em]" />
                {characterLabel(yourCharacter, yourMoveset)}
              </span>
              . Waiting for {opponentName} to pick…{" "}
              {secondsLeft > 0 ? (
                <>
                  You win this game by forfeit if they don&apos;t in <Countdown deadline={deadline} />
                  s.
                </>
              ) : (
                "They're past the deadline — this should resolve in your favor shortly."
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
            ? `Juego ${game.gameNumber} — esperando a que ${opponentName} elija su personaje primero.`
            : `Game ${game.gameNumber} — waiting for ${opponentName} to lock in their character first.`}
        </p>
      </CardContent>
    );
  }

  return (
    <CardContent className="border-t border-border pt-4">
      <InputFocus>
        <p className="text-sm text-muted-foreground">
          {lang === "es" ? `Juego ${game.gameNumber} — ` : `Game ${game.gameNumber} — `}
          {lang === "es"
            ? game.gameNumber === 1
              ? "elige tu personaje (a ciegas — oculto hasta que ambos hayan elegido)."
              : opponentCharacter
                ? `${opponentName} eligió ${characterLabel(opponentCharacter, opponentMoveset)}. Tu elección:`
                : "elige tu personaje — vas primero, esto se fija antes de que tu rival elija."
            : game.gameNumber === 1
              ? "pick your character (blind — hidden until you're both locked in)."
              : opponentCharacter
                ? `${opponentName} locked in ${characterLabel(opponentCharacter, opponentMoveset)}. Your pick:`
                : "pick your character — you're up first, this locks in before the opponent picks."}{" "}
          {secondsLeft > 0 ? (
            <span className="font-medium text-foreground">
              {lang === "es" ? (
                <>
                  Elige en <Countdown deadline={deadline} />s o pierdes este juego por abandono.
                </>
              ) : (
                <>
                  Lock in within <Countdown deadline={deadline} />s or you forfeit this game.
                </>
              )}
            </span>
          ) : (
            <span className="font-medium text-destructive">
              {lang === "es"
                ? "Ya pasaste el plazo — elige ahora antes de perder por abandono."
                : "You're past the deadline — lock in now before this forfeits."}
            </span>
          )}
        </p>
        {isPracticing && (
          <p className="mt-2 text-xs text-muted-foreground">
            {lang === "es"
              ? "Entraste a la cola de esta partida en modo Práctica — solo afecta tu clasificación de práctica aparte, no tu clasificación del ladder."
              : "You queued this match as Practicing — this set only affects your separate practice rating, not your ladder rating."}
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
      </InputFocus>
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
          Esperando a que {opponentName} confirme el resultado del juego {game.gameNumber}…{" "}
          {secondsLeft !== null && secondsLeft > 0 ? (
            <>
              Se confirma automáticamente en <Countdown deadline={deadline!} />
              s.
            </>
          ) : (
            "Ya pasaron el plazo — esto debería resolverse a tu favor pronto."
          )}
        </>
      ) : (
        <>
          Waiting for {opponentName} to confirm game {game.gameNumber}&apos;s result…{" "}
          {secondsLeft !== null && secondsLeft > 0 ? (
            <>
              It auto-confirms in <Countdown deadline={deadline!} />
              s.
            </>
          ) : (
            "They're past the deadline — this should resolve in your favor shortly."
          )}
        </>
      );
  } else if (game.reportedById) {
    statusLine =
      lang === "es" ? (
        <>
          {game.reportedWinnerId === userId
            ? `${opponentName} reportó que tú ganaste el juego ${game.gameNumber}.`
            : `${opponentName} reportó que ganó el juego ${game.gameNumber}.`}{" "}
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
            ? `${opponentName} reported you won game ${game.gameNumber}.`
            : `${opponentName} reported they won game ${game.gameNumber}.`}{" "}
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
          ? `Reporta el resultado del juego ${game.gameNumber} una vez que hayan jugado. Si solo uno de los dos reporta, el otro tiene ${REPORT_TIMEOUT_MS / 60_000} minutos para confirmar o disputar antes de que se acepte automáticamente y se le marque un no-show al que no respondió.`
          : `Report game ${game.gameNumber}'s result once you've played. If only one of you reports, the other has ${REPORT_TIMEOUT_MS / 60_000} minutes to confirm or dispute before it auto-confirms and the non-responder is charged a no-show.`}
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

  return (
    <CardContent className="border-t border-border pt-4">
      {needsMyReport ? <InputFocus>{body}</InputFocus> : body}
    </CardContent>
  );
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
        {lang === "es" ? "Código de sala" : "Room code"}
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
              Pon la contraseña de la sala del juego en{" "}
              <span className="font-medium text-foreground">{hostArenaPassword}</span>.
            </>
          ) : (
            <>
              Set the in-game room password to <span className="font-medium text-foreground">{hostArenaPassword}</span>.
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
            Pon la contraseña de la sala del juego en{" "}
            <span className="font-medium text-foreground">{hostArenaPassword}</span> — este es tu valor por defecto,
            puedes{" "}
            <Link href="/settings" className="underline hover:text-foreground">
              cambiarlo en Ajustes
            </Link>
            .
          </>
        ) : (
          <>
            Set the in-game room password to <span className="font-medium text-foreground">{hostArenaPassword}</span> —
            this is your default, you can{" "}
            <Link href="/settings" className="underline hover:text-foreground">
              change it in Settings
            </Link>
            .
          </>
        )}
      </p>
    </div>
  );
}
