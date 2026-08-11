import { Shield } from "lucide-react";
import { auth } from "@/auth";
import { listDisputedGames } from "@/lib/disputes";
import { listDisputedCorrections } from "@/lib/matches";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cancelDispute, messageDisputedPlayer, resolveCorrection, resolveDispute } from "./actions";

type DisputedGame = Awaited<ReturnType<typeof listDisputedGames>>[number];
type DisputedCorrection = Awaited<ReturnType<typeof listDisputedCorrections>>[number];

function nameFor(game: DisputedGame, userId: string | null) {
  if (!userId) return "no one";
  return userId === game.match.player1Id ? game.match.player1.username : game.match.player2.username;
}

function nameForCorrection(correction: DisputedCorrection, userId: string | null) {
  if (!userId) return "no one";
  return userId === correction.player1Id ? correction.player1.username : correction.player2.username;
}

function ModContextBadges({
  player,
}: {
  player: { username: string; _count: { reportsReceived: number; blocksReceived: number } };
}) {
  if (player._count.reportsReceived === 0 && player._count.blocksReceived === 0) return null;
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {player.username}:
      {player._count.reportsReceived > 0 && (
        <Badge variant="outline" className="tabular-nums">
          {player._count.reportsReceived} report{player._count.reportsReceived === 1 ? "" : "s"}
        </Badge>
      )}
      {player._count.blocksReceived > 0 && (
        <Badge variant="outline" className="tabular-nums">
          blocked by {player._count.blocksReceived}
        </Badge>
      )}
    </span>
  );
}

export default async function DisputesPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user?.id || (role !== "MOD" && role !== "ADMIN")) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Disputes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have access to this page.
        </p>
      </main>
    );
  }

  const [games, corrections] = await Promise.all([listDisputedGames(), listDisputedCorrections()]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Shield className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Disputes</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Resolving a game doesn&apos;t block the rest of the set — players can keep playing other
        games while one is pending here.
      </p>

      {games.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No disputed games.</p>
      )}

      <ul className="mt-6 flex flex-col gap-4">
        {games.map((game) => (
          <li key={game.id}>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {game.match.player1.username} vs {game.match.player2.username}
                  </p>
                  <Badge variant="warning">game {game.gameNumber} disputed</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {nameFor(game, game.reportedById)} reported{" "}
                  {nameFor(game, game.reportedWinnerId)} won.{" "}
                  {nameFor(game, game.secondReportById)} reported{" "}
                  {nameFor(game, game.secondReportWinnerId)} won.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <ModContextBadges player={game.match.player1} />
                  <ModContextBadges player={game.match.player2} />
                </div>
                {game.finalStage && (
                  <p className="mt-1 text-xs text-muted-foreground">Stage: {game.finalStage}</p>
                )}
                {game.match.roomCode && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Room code: {game.match.roomCode}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={resolveDispute.bind(null, game.matchId, game.gameNumber, game.match.player1Id)}>
                    <Button type="submit" size="sm">
                      {game.match.player1.username} won
                    </Button>
                  </form>
                  <form action={resolveDispute.bind(null, game.matchId, game.gameNumber, game.match.player2Id)}>
                    <Button type="submit" size="sm">
                      {game.match.player2.username} won
                    </Button>
                  </form>
                  <form action={cancelDispute.bind(null, game.matchId)}>
                    <Button type="submit" variant="outline" size="sm">
                      Cancel match
                    </Button>
                  </form>
                </div>

                <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">
                    Message a player about this dispute (sent as a Discord DM):
                  </p>
                  <MessagePlayerForm
                    playerId={game.match.player1Id}
                    playerName={game.match.player1.username}
                  />
                  <MessagePlayerForm
                    playerId={game.match.player2Id}
                    playerName={game.match.player2.username}
                  />
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex items-center gap-2">
        <Shield className="size-5 text-muted-foreground" />
        <h2 className="text-xl font-semibold tracking-tight">Correction disputes</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Both sides tried to correct an already-confirmed match&apos;s result and disagreed on the
        winner.
      </p>

      {corrections.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No disputed corrections.</p>
      )}

      <ul className="mt-6 flex flex-col gap-4">
        {corrections.map((correction) => (
          <li key={correction.id}>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {correction.player1.username} vs {correction.player2.username}
                  </p>
                  <Badge variant="warning">correction disputed</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Confirmed result: {nameForCorrection(correction, correction.reportedWinnerId)} won.{" "}
                  {nameForCorrection(correction, correction.correctionReportedById)} says{" "}
                  {nameForCorrection(correction, correction.correctionWinnerId)} actually won.{" "}
                  {nameForCorrection(correction, correction.correctionSecondReportedById)} says{" "}
                  {nameForCorrection(correction, correction.correctionSecondWinnerId)} actually won.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={resolveCorrection.bind(null, correction.id, correction.player1Id)}>
                    <Button type="submit" size="sm">
                      {correction.player1.username} won
                    </Button>
                  </form>
                  <form action={resolveCorrection.bind(null, correction.id, correction.player2Id)}>
                    <Button type="submit" size="sm">
                      {correction.player2.username} won
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}

function MessagePlayerForm({ playerId, playerName }: { playerId: string; playerName: string }) {
  return (
    <form action={messageDisputedPlayer.bind(null, playerId)} className="flex items-end gap-2">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        {playerName}
        <input
          name="message"
          required
          maxLength={1000}
          placeholder={`Message to ${playerName}…`}
          className="h-8 w-full rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      <Button type="submit" size="sm" variant="outline">
        Send
      </Button>
    </form>
  );
}
