import Image from "next/image";
import { Loader2, Swords } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getActiveLobbyEntry } from "@/lib/lobby";
import { getMatchGames, gameTurnState } from "@/lib/match-games";
import { listMatchComments } from "@/lib/match-comments";
import { NA_REGIONS } from "@/lib/regions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LobbyPoller } from "@/components/lobby-poller";
import {
  beginFirstGame,
  cancelLobby,
  cancelMatchInProgress,
  joinLobby,
  pickStage,
  reportConduct,
  reportGame,
  sendMatchComment,
  strikeStage,
  submitRoomCode,
  updateRegion,
  updateWiredConnection,
} from "./actions";

type Match = NonNullable<NonNullable<Awaited<ReturnType<typeof getActiveLobbyEntry>>>["match"]>;

export default async function LobbyPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <PageTitle />
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

      {!entry && (
        <Card className="mt-8">
          <CardContent className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-end">
            <RegionForm userId={session.user.id} />
            <WiredConnectionForm userId={session.user.id} />
          </CardContent>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">You&apos;re not in the queue.</p>
            <form action={joinLobby} className="mt-4">
              <Button type="submit">Join Lobby</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {entry?.status === "WAITING" && (
        <Card className="mt-8">
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
          <LobbyPoller />
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

async function RegionForm({ userId }: { userId: string }) {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { region: true } });

  async function action(formData: FormData) {
    "use server";
    await updateRegion(String(formData.get("region") ?? ""));
  }

  return (
    <form action={action} className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        Your region
        <span className="text-xs font-normal text-muted-foreground">
          Used to prefer close-by opponents for a better connection.
        </span>
        <select
          name="region"
          defaultValue={me?.region ?? ""}
          className="h-8 w-40 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        >
          <option value="">Not set</option>
          {NA_REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" variant="outline">
        Save
      </Button>
    </form>
  );
}

async function WiredConnectionForm({ userId }: { userId: string }) {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { wiredConnection: true } });

  async function action(formData: FormData) {
    "use server";
    await updateWiredConnection(formData.get("wired") === "on");
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="wired"
          defaultChecked={me?.wiredConnection ?? false}
          className="size-4 rounded border-border"
        />
        On a wired (LAN) connection
      </label>
      <Button type="submit" size="sm" variant="outline">
        Save
      </Button>
    </form>
  );
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
    <Card className="mt-8">
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

      {match.status === "PENDING_REPORT" && (
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
        <ConfirmedSection userId={userId} match={match} />
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
        {match.status === "PENDING_REPORT" && (
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
  const current = games.find((g) => !g.winnerId);

  if (!current) {
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

  return (
    <CardContent className="border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">
        Game {current.gameNumber} —{" "}
        {myTurn ? `Your turn — ${verb} a stage.` : `Waiting for ${opponentName} to ${verb}…`}
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
      {!myTurn && <LobbyPoller />}
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
        <LobbyPoller />
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

function ConfirmedSection({ userId, match }: { userId: string; match: Match }) {
  const won = match.reportedWinnerId === userId;
  const ratingBefore = match.player1Id === userId ? match.player1RatingBefore : match.player2RatingBefore;
  const ratingAfter = match.player1Id === userId ? match.player1RatingAfter : match.player2RatingAfter;
  const delta = (ratingAfter ?? 0) - (ratingBefore ?? 0);

  return (
    <CardContent className="border-t border-border pt-4">
      <p className="text-sm font-medium">Set confirmed — you {won ? "won" : "lost"}</p>
      <p className="mt-1 text-sm tabular-nums text-muted-foreground">
        {ratingBefore} → {ratingAfter} ({delta >= 0 ? "+" : ""}
        {delta})
      </p>
      <form action={joinLobby} className="mt-4">
        <Button type="submit">Join Lobby</Button>
      </form>
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
          placeholder="e.g. AB12CD"
          className="h-8 w-40 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      <Button type="submit" size="sm">
        Save
      </Button>
    </form>
  );
}
