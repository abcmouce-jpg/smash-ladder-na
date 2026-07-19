import { Shield } from "lucide-react";
import { auth } from "@/auth";
import { listDisputedGames } from "@/lib/disputes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cancelDispute, resolveDispute } from "./actions";

type DisputedGame = Awaited<ReturnType<typeof listDisputedGames>>[number];

function nameFor(game: DisputedGame, userId: string | null) {
  if (!userId) return "no one";
  return userId === game.match.player1Id ? game.match.player1.username : game.match.player2.username;
}

export default async function DisputesPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user?.id || (role !== "MOD" && role !== "ADMIN")) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Disputes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have access to this page.
        </p>
      </main>
    );
  }

  const games = await listDisputedGames();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
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
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
