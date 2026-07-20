import Image from "next/image";
import { Loader2, Swords, Users } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getActiveLobbyEntry, getLobbyActivityStats } from "@/lib/lobby";
import { getMatchGames, gameTurnState } from "@/lib/match-games";
import { listMatchComments } from "@/lib/match-comments";
import { MATCH_DISTANCE_PRESETS, MATCH_REGIONS } from "@/lib/regions";
import { SMASH_CHARACTERS } from "@/lib/characters";
import { didTierUp, getRankTier } from "@/lib/rank-tier";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LobbyPoller } from "@/components/lobby-poller";
import { JoinLobbyForm } from "@/components/join-lobby-button";
import { WiredConnectionForm } from "@/components/wired-connection-form";
import { VictoryCelebration } from "@/components/victory-celebration";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import {
  beginFirstGame,
  cancelLobby,
  cancelMatchInProgress,
  joinLobby,
  pickStage,
  reportConduct,
  reportGame,
  reportOpponentCharacterAction,
  sendMatchComment,
  strikeStage,
  submitRoomCode,
  updateMaxMatchDistance,
  updateRegion,
  updateStartggUrl,
  updateWiredConnection,
} from "./actions";

type Match = NonNullable<NonNullable<Awaited<ReturnType<typeof getActiveLobbyEntry>>>["match"]>;

export default async function LobbyPage() {
  const session = await auth();
  const activity = await getLobbyActivityStats();

  if (!session?.user?.id) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <PageTitle />
        <ActivityLine waiting={activity.waiting} inMatch={activity.inMatch} />
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with Discord (top right) to join the matchmaking lobby.
        </p>
      </main>
    );
  }

  const entry = await getActiveLobbyEntry(session.user.id);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <PageTitle />
      <ActivityLine waiting={activity.waiting} inMatch={activity.inMatch} />

      <Card className="mt-8">
        <CardContent className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-end">
          <RegionForm userId={session.user.id} />
          <WiredConnectionField userId={session.user.id} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <StartggProfileForm userId={session.user.id} />
        </CardContent>
      </Card>

      {!entry && (
        <Card className="mt-4">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">You&apos;re not in the queue.</p>
            <JoinLobbyForm action={joinLobby} className="mt-4" />
          </CardContent>
        </Card>
      )}

      {entry?.status === "WAITING" && (
        <Card className="mt-4">
          <CardContent className="flex items-center gap-3 pt-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Waiting for an opponent…</p>
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

function ActivityLine({ waiting, inMatch }: { waiting: number; inMatch: number }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
      <Users className="size-3.5" />
      <span className="tabular-nums">
        <span className="font-medium text-foreground">{waiting}</span> waiting to be matched
        {inMatch > 0 && (
          <>
            {" "}
            · <span className="font-medium text-foreground">{inMatch}</span> currently playing
          </>
        )}
      </span>
      <LobbyPoller />
    </div>
  );
}

const WORLDWIDE_VALUE = "worldwide";

async function StartggProfileForm({ userId }: { userId: string }) {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { startggUrl: true } });

  async function action(formData: FormData) {
    "use server";
    await updateStartggUrl(String(formData.get("startggUrl") ?? ""));
  }

  return (
    <form action={action} className="flex items-end gap-2">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        start.gg profile
        <span className="text-xs font-normal text-muted-foreground">
          Self-declared — link your start.gg profile so others can look up your results.
        </span>
        <input
          name="startggUrl"
          type="url"
          defaultValue={me?.startggUrl ?? ""}
          placeholder="https://www.start.gg/user/..."
          className="h-8 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      <Button type="submit" size="sm">
        Save
      </Button>
    </form>
  );
}

async function RegionForm({ userId }: { userId: string }) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { region: true, maxMatchDistanceKm: true },
  });

  async function action(formData: FormData) {
    "use server";
    await updateRegion(String(formData.get("region") ?? ""));
    const distance = String(formData.get("maxMatchDistanceKm") ?? "");
    await updateMaxMatchDistance(distance === WORLDWIDE_VALUE ? null : Number(distance));
  }

  return (
    <AutoSubmitForm action={action} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        Match region
        <span className="text-xs font-normal text-muted-foreground">
          Required to queue — same or nearby-region players are matched by default. Saves as
          soon as you pick one.
        </span>
        <select
          name="region"
          defaultValue={me?.region ?? ""}
          className="h-8 w-40 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
        >
          <option value="" className="bg-background text-foreground">
            Not set
          </option>
          {MATCH_REGIONS.map((r) => (
            <option key={r} value={r} className="bg-background text-foreground">
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Match distance
        <span className="text-xs font-normal text-muted-foreground">
          Matching requires BOTH players&apos; distance setting to cover the actual distance
          between them — widening yours doesn&apos;t override the other side&apos;s.
        </span>
        <select
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
    </AutoSubmitForm>
  );
}

async function WiredConnectionField({ userId }: { userId: string }) {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { wiredConnection: true } });

  return <WiredConnectionForm action={updateWiredConnection} defaultChecked={me?.wiredConnection ?? false} />;
}

async function PairedView({ userId, match }: { userId: string; match: Match }) {
  const opponent = match.player1Id === userId ? match.player2 : match.player1;
  const games = await getMatchGames(match.id);
  const wins = { me: 0, opponent: 0 };
  for (const g of games) {
    if (g.winnerId === userId) wins.me++;
    else if (g.winnerId) wins.opponent++;
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Matched!</p>
          <Badge variant={match.status === "CONFIRMED" ? "success" : "secondary"}>
            {match.status.replace("_", " ").toLowerCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        {opponent.avatarUrl && (
          <Image
            src={opponent.avatarUrl}
            alt={opponent.username}
            width={40}
            height={40}
            className="rounded-full"
          />
        )}
        <div>
          <p className="font-medium">{opponent.username}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{opponent.rating} rating</p>
        </div>
        {games.length > 0 && (
          <Badge variant="outline" className="ml-auto tabular-nums">
            {wins.me}–{wins.opponent}
          </Badge>
        )}
      </CardContent>

      <CardContent>
        <RoomCodeForm
          matchId={match.id}
          initialValue={match.roomCode ?? ""}
          readOnly={!!match.roomCodeSetById && match.roomCodeSetById !== userId}
          setByOpponent={match.roomCodeSetById === opponent.id}
        />
      </CardContent>

      {games.filter(isDisputedGame).map((g) => (
        <CardContent key={g.id} className="border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            ⚠️ Game {g.gameNumber}&apos;s result is disputed and awaiting mod review — this
            doesn&apos;t block the rest of the set.
          </p>
        </CardContent>
      ))}

      {(match.status === "PENDING_REPORT" || match.status === "REPORTED") && (
        <GameSection userId={userId} match={match} games={games} opponentName={opponent.username} />
      )}

      {match.status === "DISPUTED" && (
        <CardContent className="border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            You and {opponent.username} reported different results. This match is awaiting review.
          </p>
        </CardContent>
      )}

      {match.status === "CONFIRMED" && (
        <ConfirmedSection userId={userId} match={match} opponentName={opponent.username} />
      )}

      {(match.status === "CANCELLED" || match.status === "EXPIRED") && (
        <TerminatedSection status={match.status} />
      )}

      <CommentsSection userId={userId} match={match} />

      <MatchFooterActions match={match} />
    </Card>
  );
}

function MatchFooterActions({ match }: { match: Match }) {
  async function report(formData: FormData) {
    "use server";
    const reason = String(formData.get("reason") ?? "");
    if (reason.trim()) await reportConduct(match.id, reason);
  }

  return (
    <CardContent className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Problem with this match? Cancel it or report your opponent.
        </p>
        {(match.status === "PENDING_REPORT" || match.status === "REPORTED") && (
          <form action={cancelMatchInProgress.bind(null, match.id)}>
            <Button type="submit" variant="destructive" size="sm">
              Cancel match
            </Button>
          </form>
        )}
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Report a problem
        </summary>
        <form action={report} className="mt-2 flex items-end gap-2">
          <textarea
            name="reason"
            required
            rows={2}
            placeholder="What happened?"
            maxLength={1000}
            className="w-full resize-none rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
          />
          <Button type="submit" size="sm" variant="outline">
            Submit
          </Button>
        </form>
      </details>
    </CardContent>
  );
}

function isDisputedGame(game: { winnerId: string | null; reportedWinnerId: string | null; secondReportWinnerId: string | null }) {
  return !game.winnerId && !!game.secondReportWinnerId && game.secondReportWinnerId !== game.reportedWinnerId;
}

function GameSection({
  userId,
  match,
  games,
  opponentName,
}: {
  userId: string;
  match: Match;
  games: Awaited<ReturnType<typeof getMatchGames>>;
  opponentName: string;
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
            Game {lastGame.gameNumber}&apos;s result is disputed — a mod will resolve it.
            {lastGame.finalStage && ` Stage was ${lastGame.finalStage}.`}
          </p>
        </CardContent>
      );
    }

    const gameNumber = games.length + 1;
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          {gameNumber === 1
            ? "Settle on a stage before you play."
            : `Game ${gameNumber} — winner of the last game strikes first.`}
        </p>
        <form action={beginFirstGame.bind(null, match.id)} className="mt-3">
          <Button type="submit" variant="outline" size="sm">
            Start Game {gameNumber}
          </Button>
        </form>
      </CardContent>
    );
  }

  const turn = gameTurnState(current);

  if (turn.phase === "done") {
    return (
      <>
        <CardContent className="border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">Game {current.gameNumber} stage</p>
          <p className="mt-1 font-medium">{current.finalStage}</p>
        </CardContent>
        <ReportGameSection userId={userId} match={match} game={current} opponentName={opponentName} />
      </>
    );
  }

  const myTurn = turn.actorId === userId;
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

  return (
    <CardContent className="border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">
        Game {current.gameNumber} —{" "}
        {myTurn ? `Your turn — ${turnDescription}.` : `Waiting for ${opponentName} to ${verb}…`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {current.stagesRemaining.map((stage) => (
          <form key={stage} action={action.bind(null, match.id, current.gameNumber, stage)}>
            <Button type="submit" size="sm" variant="outline" disabled={!myTurn}>
              {stage}
            </Button>
          </form>
        ))}
      </div>
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
          <form action={reportGame.bind(null, match.id, game.gameNumber, true)}>
            <Button type="submit">I Won</Button>
          </form>
          <form action={reportGame.bind(null, match.id, game.gameNumber, false)}>
            <Button type="submit" variant="outline">
              I Lost
            </Button>
          </form>
        </div>
      </CardContent>
    );
  }

  if (game.reportedById === userId) {
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          Waiting for {opponentName} to confirm game {game.gameNumber}&apos;s result…
        </p>
      </CardContent>
    );
  }

  const theyClaimedTheyWon = game.reportedWinnerId !== userId;
  return (
    <CardContent className="border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">
        {opponentName} reported that {theyClaimedTheyWon ? "they won" : "you won"} game{" "}
        {game.gameNumber}. Does that match what happened?
      </p>
      <div className="mt-4 flex gap-2">
        <form action={reportGame.bind(null, match.id, game.gameNumber, !theyClaimedTheyWon)}>
          <Button type="submit">Yes, that&apos;s right</Button>
        </form>
        <form action={reportGame.bind(null, match.id, game.gameNumber, theyClaimedTheyWon)}>
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
  opponentName,
}: {
  userId: string;
  match: Match;
  opponentName: string;
}) {
  const won = match.reportedWinnerId === userId;
  const ratingBefore = match.player1Id === userId ? match.player1RatingBefore : match.player2RatingBefore;
  const ratingAfter = match.player1Id === userId ? match.player1RatingAfter : match.player2RatingAfter;
  const delta = (ratingAfter ?? 0) - (ratingBefore ?? 0);

  async function reportCharacter(formData: FormData) {
    "use server";
    const character = String(formData.get("character") ?? "");
    if (character) await reportOpponentCharacterAction(match.id, character);
  }

  let celebration: React.ReactNode = null;
  if (won && ratingBefore !== null && ratingAfter !== null) {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { gamesPlayed: true } });
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
    <CardContent className="border-t border-border pt-4">
      {celebration ?? (
        <>
          <p className="text-sm font-medium">Set confirmed — you lost</p>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            {ratingBefore} → {ratingAfter} ({delta >= 0 ? "+" : ""}
            {delta})
          </p>
        </>
      )}

      <form action={reportCharacter} className="mt-4 flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          What did {opponentName} play? (optional)
          <select
            name="character"
            defaultValue=""
            className="h-8 w-48 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
          >
            <option value="" className="bg-background text-foreground">
              Skip
            </option>
            {SMASH_CHARACTERS.map((c) => (
              <option key={c} value={c} className="bg-background text-foreground">
                {c}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" variant="outline">
          Report
        </Button>
      </form>

      <JoinLobbyForm action={joinLobby} className="mt-4" />
    </CardContent>
  );
}

function TerminatedSection({ status }: { status: "CANCELLED" | "EXPIRED" }) {
  return (
    <CardContent className="border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">
        {status === "CANCELLED"
          ? "This match was cancelled — no rating impact."
          : "Nobody reported a result in time, so this match expired with no rating impact."}
      </p>
      <JoinLobbyForm action={joinLobby} className="mt-4" />
    </CardContent>
  );
}

async function CommentsSection({ userId, match }: { userId: string; match: Match }) {
  const comments = await listMatchComments(userId, match.id);

  async function action(formData: FormData) {
    "use server";
    const body = String(formData.get("body") ?? "");
    if (body.trim()) await sendMatchComment(match.id, body);
  }

  return (
    <CardContent className="border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">Comments</p>
      {comments.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">No messages yet.</p>
      )}
      <ul className="mt-2 flex flex-col gap-1.5">
        {comments.map((c) => (
          <li key={c.id} className="text-sm">
            <span className="font-medium">{c.author.username}:</span> {c.body}
          </li>
        ))}
      </ul>
      <form action={action} className="mt-3 flex gap-2">
        <input
          name="body"
          placeholder="Say something…"
          maxLength={500}
          className="h-8 flex-1 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
        <Button type="submit" size="sm">
          Send
        </Button>
      </form>
    </CardContent>
  );
}

function RoomCodeForm({
  matchId,
  initialValue,
  readOnly,
  setByOpponent,
}: {
  matchId: string;
  initialValue: string;
  readOnly: boolean;
  setByOpponent: boolean;
}) {
  async function action(formData: FormData) {
    "use server";
    const roomCode = String(formData.get("roomCode") ?? "");
    await submitRoomCode(matchId, roomCode);
  }

  if (readOnly) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        Room code
        <p className="font-medium tabular-nums">{initialValue || "Not set yet"}</p>
        {setByOpponent && (
          <p className="text-xs text-muted-foreground">Set by your opponent — join with this.</p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        Room code
        <input
          name="roomCode"
          defaultValue={initialValue}
          placeholder="e.g. AB123"
          className="h-8 w-40 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      <Button type="submit" size="sm">
        Save
      </Button>
    </form>
  );
}
