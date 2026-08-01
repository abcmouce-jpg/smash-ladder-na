import Image from "next/image";
import Link from "next/link";
import { Loader2, MapPin, Swords, Users } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getActiveLobbyEntry, getLobbyActivityStats } from "@/lib/lobby";
import { getUnresolvedMatchForUser, hasOpponentEngaged } from "@/lib/matches";
import { shouldPollLobby } from "@/lib/lobby-poll";
import {
  currentStreak,
  getPlayerMatchHistory,
  getTopCharacters,
} from "@/lib/players";
import {
  STRIKE_TIMEOUT_MS,
  CHARACTER_TIMEOUT_MS,
  bothCharactersLocked,
  characterPickState,
  getMatchGames,
  gameTurnState,
  lastPlayedStage,
  lastSameBans,
  lastUsedCharacter,
  secondsUntil,
} from "@/lib/match-games";
import {
  stageImagePath,
  GAME_ONE_STAGES,
  COUNTERPICK_STAGES,
} from "@/lib/stages";
import { listMatchComments, isOpponentTyping } from "@/lib/match-comments";
import {
  MATCH_DISTANCE_PRESETS,
  MATCH_REGION_GROUPS,
  REGION_REFERENCE_CITY,
} from "@/lib/regions";
import {
  MATCH_RATING_GAP_PRESETS,
  didTierUp,
  getRankTier,
} from "@/lib/rank-tier";
import { REMATCH_COOLDOWN_PRESETS } from "@/lib/rematch-cooldown";
import { effectiveArenaPassword } from "@/lib/arena";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CharacterIcon } from "@/components/character-icon";
import { CharacterSelect } from "@/components/character-select";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { RoomCodeForm } from "@/components/room-code-form";
import { FlashOnChange } from "@/components/flash-on-change";
import { Countdown } from "@/components/countdown";
import { LobbyPoller } from "@/components/lobby-poller";
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
import {
  MatchSettingsForm,
  type MatchSettingsState,
} from "@/components/match-settings-form";
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
  updateMaxMatchDistance,
  updateMaxRatingGap,
  updateRegion,
  updateRematchCooldown,
  updateRequireWiredOpponent,
  updateWiredConnection,
  updateZenMode,
} from "./actions";

type Match = NonNullable<
  NonNullable<Awaited<ReturnType<typeof getActiveLobbyEntry>>>["match"]
>;

export default async function LobbyPage() {
  const session = await auth();
  const activity = await getLobbyActivityStats();

  if (!session?.user?.id) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <PageTitle />
        <ActivityLine
          waiting={activity.waiting}
          inMatch={activity.inMatch}
          matched={false}
          isWaiting={false}
          poll={false}
        />
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with Discord (top right) to join the matchmaking lobby.
        </p>
      </main>
    );
  }

  const entry = await getActiveLobbyEntry(session.user.id);
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { queueCooldownUntil: true },
  });
  const queueCooldownUntil = me?.queueCooldownUntil?.toISOString() ?? null;
  const isInActiveMatch =
    entry?.status === "PAIRED" &&
    entry.match &&
    entry.match.status !== "CONFIRMED" &&
    entry.match.status !== "CANCELLED" &&
    entry.match.status !== "EXPIRED";
  const matchJustEnded =
    entry?.status === "PAIRED" &&
    entry.match &&
    (entry.match.status === "CONFIRMED" ||
      entry.match.status === "CANCELLED" ||
      entry.match.status === "EXPIRED");
  const myLeftAt =
    matchJustEnded && entry?.match
      ? entry.match.player1Id === session.user.id
        ? entry.match.player1LeftAt
        : entry.match.player2LeftAt
      : null;

  const showChatPanel = isInActiveMatch || matchJustEnded;

  return (
    <main
      className={`mx-auto px-6 py-16 ${showChatPanel ? "max-w-5xl" : "max-w-2xl"}`}
    >
      <PageTitle />
      <ActivityLine
        waiting={activity.waiting}
        inMatch={activity.inMatch}
        matched={!!isInActiveMatch}
        isWaiting={entry?.status === "WAITING"}
        poll={shouldPollLobby({
          isInActiveMatch: !!isInActiveMatch,
          isWaiting: entry?.status === "WAITING",
          matchJustEnded: !!matchJustEnded,
          hasLeftMatch: !!myLeftAt,
        })}
      />

      {matchJustEnded && (
        <Card className="mt-4 border-primary/30">
          <CardContent className="pt-4">
            <p className="text-sm font-medium">Ready for another match?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This starts a brand new search — it&apos;s not related to the
              match below.
            </p>
            <QueueCooldownGate cooldownUntil={queueCooldownUntil}>
              <JoinLobbyForm action={joinLobby} className="mt-3" />
            </QueueCooldownGate>
          </CardContent>
        </Card>
      )}

      {isInActiveMatch ? (
        <Card className="mt-8">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Profile and matchmaking settings are locked while a match is in
              progress.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-8">
          <CardContent className="pt-4">
            <MatchmakingForm userId={session.user.id} />
          </CardContent>
        </Card>
      )}

      {!entry && (
        <Card className="mt-4">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              You&apos;re not in the queue.
            </p>
            <QueueCooldownGate cooldownUntil={queueCooldownUntil}>
              <JoinLobbyForm action={joinLobby} className="mt-4" />
            </QueueCooldownGate>
          </CardContent>
        </Card>
      )}

      {entry?.status === "WAITING" && (
        <Card className="mt-4">
          <CardContent className="flex items-center gap-3 pt-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Waiting for an opponent…
            </p>
          </CardContent>
          <CardContent className="pt-0">
            <form action={cancelLobby}>
              <Button type="submit" variant="outline">
                Cancel
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {entry?.status === "PAIRED" && entry.match && (
        <PairedView userId={session.user.id} match={entry.match} />
      )}
    </main>
  );
}

function PageTitle() {
  return (
    <div className="flex items-center gap-2">
      <Swords className="size-5 text-muted-foreground" />
      <h1 className="text-2xl font-semibold tracking-tight">Lobby</h1>
    </div>
  );
}

function ActivityLine({
  waiting,
  inMatch,
  matched,
  isWaiting,
  poll,
}: {
  waiting: number;
  inMatch: number;
  matched: boolean;
  isWaiting: boolean;
  poll: boolean;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
      <Users className="size-3.5" />
      <span className="tabular-nums">
        <span className="font-medium text-foreground">{waiting}</span> waiting
        to be matched
        {inMatch > 0 && (
          <>
            {" "}
            · <span className="font-medium text-foreground">
              {inMatch}
            </span>{" "}
            currently playing
          </>
        )}
      </span>
      {poll && (
        <LobbyPoller matched={matched} keepPollingInBackground={isWaiting} />
      )}
    </div>
  );
}

const WORLDWIDE_VALUE = "worldwide";
const ANY_RATING_VALUE = "any";
const ANYTIME_VALUE = "anytime";

async function MatchmakingForm({ userId }: { userId: string }) {
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
  async function action(
    _prevState: MatchSettingsState,
    formData: FormData,
  ): Promise<MatchSettingsState> {
    "use server";
    try {
      await updateRegion(String(formData.get("region") ?? ""));
      const distance = String(formData.get("maxMatchDistanceKm") ?? "");
      await updateMaxMatchDistance(
        distance === WORLDWIDE_VALUE ? null : Number(distance),
      );
      const ratingGap = String(formData.get("maxRatingGap") ?? "");
      await updateMaxRatingGap(
        ratingGap === ANY_RATING_VALUE ? null : Number(ratingGap),
      );
      const rematchCooldown = String(
        formData.get("rematchCooldownHours") ?? "",
      );
      await updateRematchCooldown(
        rematchCooldown === ANYTIME_VALUE ? null : Number(rematchCooldown),
      );
      await updateRequireWiredOpponent(
        formData.get("requireWiredOpponent") === "on",
      );
      await updateAvoidPracticeOpponents(
        formData.get("avoidPracticeOpponents") === "on",
      );
      await updateZenMode(formData.get("zenMode") === "on");
      await updateWiredConnection(formData.get("wired") === "on");
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? err.message
            : "Something went wrong — try again.",
        saved: false,
      };
    }
    return { error: null, saved: true };
  }

  return (
    <MatchSettingsForm action={action} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        Match region
        <span className="text-xs font-normal text-muted-foreground">
          Required to queue — matching works off the distance between regions,
          so pick whichever is physically closest to you, even if it&apos;s not
          your own country. Other has no location, so it only ever matches other
          Other players.
        </span>
        <select
          key={me?.region ?? ""}
          name="region"
          defaultValue={me?.region ?? ""}
          className="h-8 w-52 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
        >
          <option value="" className="bg-background text-foreground">
            Not set
          </option>
          {MATCH_REGION_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.regions.map((r) => (
                <option
                  key={r}
                  value={r}
                  className="bg-background text-foreground"
                >
                  {REGION_REFERENCE_CITY[r]
                    ? `${r} (${REGION_REFERENCE_CITY[r]})`
                    : r}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Match distance
        <span className="text-xs font-normal text-muted-foreground">
          Matching requires BOTH players&apos; distance setting to cover the
          actual distance between them — widening yours doesn&apos;t override
          the other side&apos;s.
        </span>
        <select
          key={String(me?.maxMatchDistanceKm ?? WORLDWIDE_VALUE)}
          name="maxMatchDistanceKm"
          defaultValue={String(me?.maxMatchDistanceKm ?? WORLDWIDE_VALUE)}
          className="h-8 w-48 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
        >
          {MATCH_DISTANCE_PRESETS.map((preset) => (
            <option
              key={preset.label}
              value={String(preset.km ?? WORLDWIDE_VALUE)}
              className="bg-background text-foreground"
            >
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Rating gap
        <span className="text-xs font-normal text-muted-foreground">
          Matching requires BOTH players&apos; rating-gap setting to cover the
          actual difference in rating.
        </span>
        <select
          key={String(me?.maxRatingGap ?? ANY_RATING_VALUE)}
          name="maxRatingGap"
          defaultValue={String(me?.maxRatingGap ?? ANY_RATING_VALUE)}
          className="h-8 w-48 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
        >
          {MATCH_RATING_GAP_PRESETS.map((preset) => (
            <option
              key={preset.label}
              value={String(preset.gap ?? ANY_RATING_VALUE)}
              className="bg-background text-foreground"
            >
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Rematch cooldown
        <span className="text-xs font-normal text-muted-foreground">
          Matching requires BOTH players&apos; cooldown to have elapsed since
          you two last played.
        </span>
        <select
          key={String(me?.rematchCooldownHours ?? ANYTIME_VALUE)}
          name="rematchCooldownHours"
          defaultValue={String(me?.rematchCooldownHours ?? ANYTIME_VALUE)}
          className="h-8 w-48 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
        >
          {REMATCH_COOLDOWN_PRESETS.map((preset) => (
            <option
              key={preset.label}
              value={String(preset.hours ?? ANYTIME_VALUE)}
              className="bg-background text-foreground"
            >
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-1 flex items-center gap-2 text-sm">
        <input
          key={String(me?.wiredConnection ?? false)}
          type="checkbox"
          name="wired"
          defaultChecked={me?.wiredConnection ?? false}
          className="size-4 rounded border-border"
        />
        On a wired (LAN) connection
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          key={String(me?.requireWiredOpponent ?? false)}
          type="checkbox"
          name="requireWiredOpponent"
          defaultChecked={me?.requireWiredOpponent ?? false}
          className="size-4 rounded border-border"
        />
        Only match with wired opponents
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          key={String(me?.avoidPracticeOpponents ?? false)}
          type="checkbox"
          name="avoidPracticeOpponents"
          defaultChecked={me?.avoidPracticeOpponents ?? false}
          className="size-4 rounded border-border"
        />
        Don&apos;t match me with opponents who are practicing
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          key={String(me?.zenMode ?? false)}
          type="checkbox"
          name="zenMode"
          defaultChecked={me?.zenMode ?? false}
          className="size-4 rounded border-border"
        />
        Zen Mode — hide opponent&apos;s rating, name, characters, and avatar
      </label>
    </MatchSettingsForm>
  );
}

// Once a match is over, its full detail (room code, dispute history,
// opponent card) has nothing left to act on and just sits on the Lobby
// page as clutter — that's what the player's own match history on their
// profile is for. But comments are kept open by default so both players
// can keep talking; either can end their own view of it via Leave.
async function PairedView({ userId, match }: { userId: string; match: Match }) {
  const opponent = match.player1Id === userId ? match.player2 : match.player1;
  const isPlayer1 = match.player1Id === userId;
  const myLeftAt = isPlayer1 ? match.player1LeftAt : match.player2LeftAt;
  const opponentLeftAt = isPlayer1 ? match.player2LeftAt : match.player1LeftAt;
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { zenMode: true, rating: true, region: true },
  });
  const zenMode = me?.zenMode ?? false;
  const displayName = zenMode ? "Opponent" : opponent.username;

  if (
    match.status === "CONFIRMED" ||
    match.status === "CANCELLED" ||
    match.status === "EXPIRED"
  ) {
    // Opponent may have queued into (and already be playing) a new match since
    // this one ended — a stale rematch request would otherwise just sit there
    // showing "Waiting…" forever, since requestRematch silently no-ops in that
    // case (see the eitherAlreadyPlaying check in lib/matches.ts).
    const opponentUnavailable =
      !myLeftAt && !opponentLeftAt
        ? !!(await getUnresolvedMatchForUser(opponent.id))
        : false;
    const chat = (
      <CommentsSection
        userId={userId}
        match={match}
        opponentName={displayName}
        opponentHasLeft={!!opponentLeftAt}
        zenMode={zenMode}
      />
    );
    return (
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          {match.status === "CONFIRMED" ? (
            <ConfirmedSection userId={userId} match={match} />
          ) : (
            <TerminatedSection status={match.status} />
          )}
          {!myLeftAt && (
            <CardContent className="flex items-center gap-3 border-t border-border pt-4">
              <RematchSection
                matchId={match.id}
                opponentName={displayName}
                myRequestedAt={
                  isPlayer1
                    ? match.player1RematchRequestedAt
                    : match.player2RematchRequestedAt
                }
                opponentRequestedAt={
                  isPlayer1
                    ? match.player2RematchRequestedAt
                    : match.player1RematchRequestedAt
                }
                opponentLeftAt={opponentLeftAt}
                opponentUnavailable={opponentUnavailable}
              />
              <form
                action={leaveMatchAction.bind(null, match.id)}
                className="ml-auto"
              >
                <Button type="submit" variant="outline" size="sm">
                  Leave
                </Button>
              </form>
            </CardContent>
          )}
          <CardContent className="border-t border-border pt-4">
            <Link
              href={`/players/${userId}`}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              View full match details on your profile →
            </Link>
          </CardContent>
        </Card>
        <div>{chat}</div>
      </div>
    );
  }

  const games = await getMatchGames(match.id);
  const topCharacters = await getTopCharacters(opponent.id);
  const myTopCharacter = (await getTopCharacters(userId, 1))[0] ?? null;
  const opponentStreak = currentStreak(
    await getPlayerMatchHistory(opponent.id),
  );
  // Once any game's been decided or reported, cancelMatch is blocked
  // outright (see its gameInProgress check) — surrenderMatch isn't, so the
  // button always means "surrender" from that point on, no need to spend a
  // query re-checking opponent engagement.
  const gameDecided = games.some(
    (g) => g.winnerId !== null || g.reportedById !== null,
  );
  const opponentEngaged = gameDecided
    ? true
    : await hasOpponentEngaged(match.id, opponent.id, match.roomCodeSetById);
  const wins = { me: 0, opponent: 0 };
  for (const g of games) {
    if (g.winnerId === userId) wins.me++;
    else if (g.winnerId) wins.opponent++;
  }

  const chat = (
    <CommentsSection
      userId={userId}
      match={match}
      opponentName={displayName}
      opponentHasLeft={!!opponentLeftAt}
      zenMode={zenMode}
    />
  );

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <p className="badge-pop text-base font-semibold text-foreground">
              🎮 You&apos;ve been matched!
            </p>
            <Badge variant="secondary">
              {match.status.replace("_", " ").toLowerCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground tabular-nums">
            You: {me?.rating} rating
            {me?.region && (
              <span className="ml-2 inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {me.region}
              </span>
            )}
          </p>
          <div className="flex items-center gap-3">
            {!zenMode && opponent.avatarUrl && (
              <Image
                src={opponent.avatarUrl}
                alt={opponent.username}
                width={40}
                height={40}
                className="rounded-full"
              />
            )}
            <div className={zenMode ? "flex-1" : ""}>
              {!zenMode && (
                <p className="flex items-center gap-1.5 font-medium">
                  {displayName}
                  {opponentStreak !== 0 && (
                    <Badge
                      variant={opponentStreak > 0 ? "success" : "destructive"}
                      className="tabular-nums"
                    >
                      {Math.abs(opponentStreak)}{" "}
                      {opponentStreak > 0 ? "win" : "loss"} streak
                    </Badge>
                  )}
                </p>
              )}
              {(!zenMode || opponent.region) && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
                  {!zenMode && <span>{opponent.rating} rating</span>}
                  {opponent.region && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" />
                      {opponent.region}
                    </span>
                  )}
                </p>
              )}
              {!zenMode && topCharacters.length > 0 && (
                <div className="group/characters relative mt-1 flex items-center gap-1.5">
                  <span className="pointer-events-none absolute -top-6 left-0 z-10 rounded border border-border bg-popover px-1.5 py-0.5 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover/characters:opacity-100">
                    Most played characters
                  </span>
                  {topCharacters.map((character) => (
                    <CharacterIcon key={character} name={character} size={20} />
                  ))}
                </div>
              )}
            </div>
            {games.length > 0 && (
              <Badge variant="outline" className="ml-auto tabular-nums">
                {wins.me}–{wins.opponent}
              </Badge>
            )}
          </div>
        </CardContent>

        <CardContent>
          <RoomCodeSection
            matchId={match.id}
            initialValue={match.roomCode ?? ""}
            readOnly={
              !!match.roomCodeSetById && match.roomCodeSetById !== userId
            }
            setByOpponent={match.roomCodeSetById === opponent.id}
            myArenaPassword={effectiveArenaPassword(
              match.player1Id === userId ? match.player1 : match.player2,
            )}
            opponentArenaPassword={effectiveArenaPassword(opponent)}
          />
        </CardContent>

        {games.filter(isDisputedGame).map((g) => (
          <CardContent key={g.id} className="border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              ⚠️ Game {g.gameNumber}&apos;s result is disputed and awaiting mod
              review — this doesn&apos;t block the rest of the set.
            </p>
            <DisputeResolutionForm
              action={requestDisputeResolutionAction.bind(
                null,
                match.id,
                g.gameNumber,
              )}
              myId={userId}
              opponentId={opponent.id}
              opponentUsername={displayName}
            />
          </CardContent>
        ))}

        {(match.status === "PENDING_REPORT" || match.status === "REPORTED") && (
          <GameSection
            userId={userId}
            match={match}
            games={games}
            opponentName={displayName}
            myTopCharacter={myTopCharacter}
          />
        )}

        {match.status === "DISPUTED" && (
          <CardContent className="border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              You and {displayName} reported different results. This match is
              awaiting review.
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
          />
        ) : (
          <CardContent className="border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              This match is awaiting mod review.
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
}: {
  match: Match;
  isPlayer1: boolean;
  opponentName: string;
  opponentEngaged: boolean;
  gameDecided: boolean;
}) {
  return (
    <CardContent className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {gameDecided
            ? `A game's already been decided in this set, so backing out now always counts as a surrender (a loss). If ${opponentName} has gone quiet, you don't need to surrender for them — an unresponsive opponent auto-forfeits their turn after a few minutes and the set just continues.`
            : opponentEngaged
              ? `${opponentName} has already started this match, so backing out now counts as a surrender (a loss) instead of a free cancel.`
              : `${opponentName} hasn't shown up yet — cancelling now is free.`}
        </p>
        {(match.status === "PENDING_REPORT" || match.status === "REPORTED") && (
          <CancelOrSurrenderButton
            mode={opponentEngaged ? "surrender" : "cancel"}
            action={
              opponentEngaged
                ? surrenderMatchAction.bind(null, match.id)
                : cancelMatchInProgress.bind(null, match.id)
            }
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Can&apos;t finish this set? Both sides can agree to call it off — no
          rating impact.
        </p>
        <MutualCancelSection
          matchId={match.id}
          myRequestedAt={
            isPlayer1
              ? match.player1CancelRequestedAt
              : match.player2CancelRequestedAt
          }
          opponentRequestedAt={
            isPlayer1
              ? match.player2CancelRequestedAt
              : match.player1CancelRequestedAt
          }
          opponentName={opponentName}
        />
      </div>
      <ReportConductForm action={reportConductAction.bind(null, match.id)} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Laggy, rollback-heavy, or disconnected during this match?
        </p>
        <form action={reportConnection.bind(null, match.id)}>
          <Button type="submit" size="sm" variant="outline">
            Connection Report
          </Button>
        </form>
      </div>
    </CardContent>
  );
}

function isDisputedGame(game: {
  winnerId: string | null;
  reportedWinnerId: string | null;
  secondReportWinnerId: string | null;
}) {
  return (
    !game.winnerId &&
    !!game.secondReportWinnerId &&
    game.secondReportWinnerId !== game.reportedWinnerId
  );
}

function GameSection({
  userId,
  match,
  games,
  opponentName,
  myTopCharacter,
}: {
  userId: string;
  match: Match;
  games: Awaited<ReturnType<typeof getMatchGames>>;
  opponentName: string;
  myTopCharacter: string | null;
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
            Game {lastGame.gameNumber}&apos;s result is disputed — a mod will
            resolve it.
            {lastGame.finalStage && ` Stage was ${lastGame.finalStage}.`}
          </p>
        </CardContent>
      );
    }

    const gameNumber = games.length + 1;
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm font-medium">
          {gameNumber === 1
            ? "Ready to pick a stage"
            : `Game ${gameNumber} — winner of the last game strikes first`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Click the button below to start stage striking with {opponentName} —
          this isn&apos;t something to sort out over chat, the site walks you
          through it turn by turn.
        </p>
        <form action={beginFirstGame.bind(null, match.id)} className="mt-3">
          <Button type="submit" size="sm">
            Start Game {gameNumber} stage striking →
          </Button>
        </form>
      </CardContent>
    );
  }

  const turn = gameTurnState(current);
  const isPracticing =
    userId === match.player1Id
      ? match.player1IsPracticing
      : match.player2IsPracticing;
  // Game 1 has no in-match history yet, so lastUsedCharacter falls through to
  // null and this defaults to the player's most-played character instead;
  // every later game already has a locked-in character from the prior game,
  // so this fallback is effectively game-1-only.
  const defaultCharacter = lastUsedCharacter(games, userId) ?? myTopCharacter;
  const characterSection = (
    <CharacterPickSection
      userId={userId}
      matchId={match.id}
      game={current}
      opponentName={opponentName}
      isPracticing={isPracticing}
      defaultCharacter={defaultCharacter}
    />
  );

  if (turn.phase === "done") {
    return (
      <>
        {characterSection}
        <CardContent className="border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            Game {current.gameNumber} stage
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
        <ReportGameSection
          userId={userId}
          match={match}
          game={current}
          opponentName={opponentName}
        />
      </>
    );
  }

  const myTurn = turn.actorId === userId;
  const bothLocked = bothCharactersLocked(current);
  const canAct = myTurn && bothLocked;
  const action = turn.phase === "striking" ? strikeStage : pickStage;
  const verb = turn.phase === "striking" ? "strike" : "pick";

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
      ? `${verb} ${remainingStrikes} stage${remainingStrikes === 1 ? "" : "s"}`
      : `${verb} a stage`;

  // Only shown once both characters are locked in (see the !bothLocked
  // branch below) — at that point turnStartedAt is purely a stage-strike
  // clock, so STRIKE_TIMEOUT_MS is the only deadline that applies here.
  const deadline = new Date(
    current.turnStartedAt.getTime() + STRIKE_TIMEOUT_MS,
  ).toISOString();

  const lastStrikeIndex = current.struckStages.length - 1;
  const canUndoLastStrike =
    turn.phase === "striking" &&
    lastStrikeIndex >= 0 &&
    (lastStrikeIndex < current.actorAStrikes
      ? current.actorAId
      : current.actorBId) === userId;

  const sameBans =
    turn.phase === "striking" &&
    current.actorAId === userId &&
    current.actorAStrikes === 3 &&
    struckSoFar === 0
      ? lastSameBans(games, userId)
      : null;

  const runItBackStage =
    turn.phase === "picking"
      ? lastPlayedStage(games, current.gameNumber)
      : null;
  const canRunItBack =
    runItBackStage !== null && current.stagesRemaining.includes(runItBackStage);

  return (
    <>
      {characterSection}
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          Game {current.gameNumber} —{" "}
          {!bothLocked ? (
            "Stage selection will start once both characters are locked in."
          ) : !myTurn ? (
            <>
              Waiting for {opponentName} to {verb}… (
              <Countdown deadline={deadline} />s left)
            </>
          ) : (
            <>
              Your turn — {turnDescription} (<Countdown deadline={deadline} />s
              left, or it auto-picks).
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
            />
          </div>
        )}
        {canRunItBack && (
          <div className="mt-3">
            <form action={runItBack.bind(null, match.id, current.gameNumber)}>
              <Button
                type="submit"
                size="sm"
                variant="default"
                disabled={!canAct}
              >
                Run it back ({runItBackStage})
              </Button>
            </form>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {(() => {
            const pool: readonly string[] =
              current.gameNumber === 1 ? GAME_ONE_STAGES : COUNTERPICK_STAGES;
            const allStages = [
              ...new Set([...current.struckStages, ...current.stagesRemaining]),
            ];
            return allStages.sort((a, b) => pool.indexOf(a) - pool.indexOf(b));
          })().map((stage) => {
            const isStruck = current.struckStages.includes(stage);
            const imgPath = stageImagePath(stage);
            return (
              <form
                key={stage}
                action={action.bind(null, match.id, current.gameNumber, stage)}
              >
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={!canAct || isStruck}
                  className={`relative flex h-24 w-36 max-sm:h-20 max-sm:w-28 flex-col items-center justify-end gap-1 overflow-hidden p-2 ${isStruck ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  {imgPath && (
                    <Image
                      src={`/stages/${imgPath}`}
                      alt={stage}
                      fill
                      className="object-cover"
                      sizes="128px"
                    />
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
          <form
            action={unstrikeStage.bind(null, match.id, current.gameNumber)}
            className="mt-2"
          >
            <Button type="submit" size="sm" variant="ghost">
              Undo my last strike
            </Button>
          </form>
        )}
      </CardContent>
    </>
  );
}

function CharacterPickSection({
  userId,
  matchId,
  game,
  opponentName,
  isPracticing,
  defaultCharacter,
}: {
  userId: string;
  matchId: string;
  game: {
    gameNumber: number;
    actorAId: string;
    actorBId: string;
    actorACharacter: string | null;
    actorBCharacter: string | null;
    createdAt: Date;
  };
  opponentName: string;
  defaultCharacter: string | null;
  isPracticing: boolean;
}) {
  const { yourCharacter, opponentCharacter, canPickNow } = characterPickState(
    game,
    userId,
  );
  // Silent from the player's point of view otherwise — autoResolveStaleCharacterPick
  // forfeits the whole game to whoever's opponent never locked in within this
  // window, measured from the game's creation, so it needs to be visible here.
  const pickDeadline = new Date(
    game.createdAt.getTime() + CHARACTER_TIMEOUT_MS,
  );
  const secondsLeft = secondsUntil(pickDeadline);
  const deadline = pickDeadline.toISOString();

  if (yourCharacter && opponentCharacter) {
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          Game {game.gameNumber} characters — you:{" "}
          <span className="font-medium text-foreground">{yourCharacter}</span>,{" "}
          {opponentName}:{" "}
          <span className="font-medium text-foreground">
            {opponentCharacter}
          </span>
        </p>
      </CardContent>
    );
  }

  if (yourCharacter && !opponentCharacter) {
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          Game {game.gameNumber} — you locked in{" "}
          <span className="font-medium text-foreground">{yourCharacter}</span>.
          Waiting for {opponentName} to pick…{" "}
          {secondsLeft > 0 ? (
            <>
              You win this game by forfeit if they don&apos;t in{" "}
              <Countdown deadline={deadline} />
              s.
            </>
          ) : (
            "They're past the deadline — this should resolve in your favor shortly."
          )}
        </p>
      </CardContent>
    );
  }

  if (!canPickNow) {
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          Game {game.gameNumber} — waiting for {opponentName} to lock in their
          character first.
        </p>
      </CardContent>
    );
  }

  return (
    <CardContent className="border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">
        Game {game.gameNumber} —{" "}
        {game.gameNumber === 1
          ? "pick your character (blind — hidden until you're both locked in)."
          : opponentCharacter
            ? `${opponentName} locked in ${opponentCharacter}. Your pick:`
            : "pick your character — you're up first, this locks in before the opponent picks."}{" "}
        {secondsLeft > 0 ? (
          <span className="font-medium text-foreground">
            Lock in within <Countdown deadline={deadline} />s or you forfeit
            this game.
          </span>
        ) : (
          <span className="font-medium text-destructive">
            You&apos;re past the deadline — lock in now before this forfeits.
          </span>
        )}
      </p>
      {isPracticing && (
        <p className="mt-2 text-xs text-muted-foreground">
          You queued this match as Practicing — this set only affects your
          separate practice rating, not your ladder rating.
        </p>
      )}
      <form
        action={pickCharacter.bind(null, matchId, game.gameNumber)}
        className="mt-3 flex items-end gap-2"
      >
        <CharacterSelect
          key={game.gameNumber}
          name="character"
          defaultValue={defaultCharacter ?? ""}
          placeholder="Select character"
        />
        <Button type="submit" size="sm" variant="outline">
          Lock in
        </Button>
      </form>
    </CardContent>
  );
}

function ReportGameSection({
  userId,
  match,
  game,
  opponentName,
}: {
  userId: string;
  match: Match;
  game: Awaited<ReturnType<typeof getMatchGames>>[number];
  opponentName: string;
}) {
  if (!game.reportedById) {
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          Report game {game.gameNumber}&apos;s result once you&apos;ve played.
        </p>
        <div className="mt-4 flex gap-2">
          <ConfirmSubmitButton
            action={reportGame.bind(null, match.id, game.gameNumber, true)}
            confirmMessage={`Report that you won game ${game.gameNumber}?`}
          >
            I Won
          </ConfirmSubmitButton>
          <ConfirmSubmitButton
            action={reportGame.bind(null, match.id, game.gameNumber, false)}
            confirmMessage={`Report that you lost game ${game.gameNumber}?`}
            variant="outline"
          >
            I Lost
          </ConfirmSubmitButton>
        </div>
      </CardContent>
    );
  }

  if (game.reportedById === userId) {
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          Waiting for {opponentName} to confirm game {game.gameNumber}&apos;s
          result…
        </p>
      </CardContent>
    );
  }

  const theyClaimedTheyWon = game.reportedWinnerId !== userId;
  return (
    <CardContent className="border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">
        {opponentName} reported that{" "}
        {theyClaimedTheyWon ? "they won" : "you won"} game {game.gameNumber}.
        Does that match what happened?
      </p>
      <div className="mt-4 flex gap-2">
        <form
          action={reportGame.bind(
            null,
            match.id,
            game.gameNumber,
            !theyClaimedTheyWon,
          )}
        >
          <Button type="submit">Yes, that&apos;s right</Button>
        </form>
        <form
          action={reportGame.bind(
            null,
            match.id,
            game.gameNumber,
            theyClaimedTheyWon,
          )}
        >
          <Button type="submit" variant="outline">
            No, that&apos;s wrong
          </Button>
        </form>
      </div>
    </CardContent>
  );
}

async function ConfirmedSection({
  userId,
  match,
}: {
  userId: string;
  match: Match;
}) {
  const won = match.reportedWinnerId === userId;
  const ratingBefore =
    match.player1Id === userId
      ? match.player1RatingBefore
      : match.player2RatingBefore;
  const ratingAfter =
    match.player1Id === userId
      ? match.player1RatingAfter
      : match.player2RatingAfter;
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
      />
    );
  }

  return (
    <CardContent className="pt-4">
      {celebration ?? (
        <>
          <p className="text-sm font-medium">Set confirmed — you lost</p>
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
}: {
  matchId: string;
  opponentName: string;
  myRequestedAt: Date | null;
  opponentRequestedAt: Date | null;
  opponentLeftAt: Date | null;
  opponentUnavailable: boolean;
}) {
  if (opponentLeftAt) {
    return (
      <p className="text-xs text-muted-foreground">
        {opponentName} has left — rematch unavailable.
      </p>
    );
  }

  if (myRequestedAt) {
    if (opponentUnavailable) {
      return (
        <p className="text-xs text-muted-foreground">
          {opponentName} is no longer available — they&apos;ve moved on to
          another match.
        </p>
      );
    }
    return (
      <p className="text-xs text-muted-foreground">
        Waiting for {opponentName} to accept the rematch…
      </p>
    );
  }

  if (opponentUnavailable) {
    return (
      <p className="text-xs text-muted-foreground">
        {opponentName} is no longer available — they&apos;ve moved on to another
        match.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {opponentRequestedAt && (
        <p className="text-xs text-muted-foreground">
          {opponentName} wants a rematch!
        </p>
      )}
      <form action={requestRematchAction.bind(null, matchId)}>
        <Button type="submit" variant="outline" size="sm">
          {opponentRequestedAt ? "Accept Rematch" : "Request Rematch"}
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
}: {
  matchId: string;
  myRequestedAt: Date | null;
  opponentRequestedAt: Date | null;
  opponentName: string;
}) {
  if (myRequestedAt) {
    return (
      <p className="text-xs text-muted-foreground">
        Waiting for {opponentName} to agree…
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {opponentRequestedAt && (
        <p className="text-xs text-muted-foreground">
          {opponentName} wants to cancel!
        </p>
      )}
      <form action={requestMutualCancelAction.bind(null, matchId)}>
        <Button type="submit" variant="outline" size="sm">
          {opponentRequestedAt ? "Agree to Cancel" : "Request Cancel"}
        </Button>
      </form>
    </div>
  );
}

function TerminatedSection({ status }: { status: "CANCELLED" | "EXPIRED" }) {
  return (
    <CardContent className="pt-4">
      <p className="text-sm text-muted-foreground">
        {status === "CANCELLED"
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
}: {
  userId: string;
  match: Match;
  opponentName: string;
  opponentHasLeft: boolean;
  zenMode?: boolean;
}) {
  const rawComments = await listMatchComments(userId, match.id);
  const opponentTyping = await isOpponentTyping(match.id, userId);

  // Determine opponent's user id for zen mode — replace their name in chat
  const opponentId =
    match.player1Id === userId ? match.player2Id : match.player1Id;

  // Serialize dates to strings for the client component
  const comments = rawComments.map((c) => ({
    id: c.id,
    author: {
      username:
        zenMode && c.author.id === opponentId ? "Opponent" : c.author.username,
    },
    body: c.body,
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
            {opponentName} has left the chat.
          </p>
        )}
        <ChatMessages
          comments={comments}
          empty={
            <p className="mt-2 text-sm text-muted-foreground">
              No messages yet.
            </p>
          }
        />
        {opponentTyping && !opponentHasLeft && (
          <TypingIndicator opponentName={opponentName} />
        )}
        <CommentForm
          action={sendMatchCommentAction.bind(null, match.id)}
          onTyping={signalTypingAction.bind(null, match.id)}
        />
      </CardContent>
    </Card>
  );
}

function RoomCodeSection({
  matchId,
  initialValue,
  readOnly,
  setByOpponent,
  myArenaPassword,
  opponentArenaPassword,
}: {
  matchId: string;
  initialValue: string;
  readOnly: boolean;
  setByOpponent: boolean;
  myArenaPassword: string;
  opponentArenaPassword: string;
}) {
  // Whoever actually ends up hosting is whoever's code stuck (locked in via
  // setMatchRoomCode) — before that, either side could still become the
  // host, so each just sees their own password until it's decided.
  const hostArenaPassword = setByOpponent
    ? opponentArenaPassword
    : myArenaPassword;

  if (readOnly) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        Room code
        <p className="font-medium tabular-nums">
          <FlashOnChange value={initialValue}>
            {initialValue || "Not set yet"}
          </FlashOnChange>
        </p>
        {setByOpponent && (
          <p className="text-xs text-muted-foreground">
            Set by your opponent — join with this.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Set the in-game room password to{" "}
          <span className="font-medium text-foreground">
            {hostArenaPassword}
          </span>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <RoomCodeForm
        initialValue={initialValue}
        action={submitRoomCode.bind(null, matchId)}
      />
      <p className="text-xs text-muted-foreground">
        Set the in-game room password to{" "}
        <span className="font-medium text-foreground">{hostArenaPassword}</span>{" "}
        — this is your default, you can{" "}
        <Link href="/settings" className="underline hover:text-foreground">
          change it in Settings
        </Link>
        .
      </p>
    </div>
  );
}
