import { Radio } from "lucide-react";
import { auth } from "@/auth";
import { listLiveMatches } from "@/lib/disputes";
import { listMatchCommentsAsMod } from "@/lib/match-comments";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ForceConfirmMatchForm } from "@/components/force-confirm-match-form";
import { EditGameScoreForm } from "@/components/edit-game-score-form";
import { CancelMatchButton } from "@/components/cancel-match-button";
import {
  forceConfirmMatchAction,
  postLiveMatchComment,
  setGameWinnerAction,
  resetMatchAction,
  cancelMatchAction,
} from "./actions";

export default async function LiveMatchesPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user?.id || (role !== "MOD" && role !== "ADMIN")) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Live matches</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have access to this page.
        </p>
      </main>
    );
  }

  const matches = await listLiveMatches();
  const comments = await Promise.all(matches.map((m) => listMatchCommentsAsMod(m.id)));

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Radio className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Live matches</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Sets currently being played, plus recently-expired ones nobody reported — use &quot;Force
        result&quot; to close out a set stuck with no report from either side. This page
        doesn&apos;t auto-refresh — reload to see updates.
      </p>

      {matches.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No matches in progress right now.</p>
      )}

      <ul className="mt-6 flex flex-col gap-4">
        {matches.map((match, i) => {
          const wins = { p1: 0, p2: 0 };
          for (const g of match.games) {
            if (g.winnerId === match.player1.id) wins.p1++;
            else if (g.winnerId === match.player2.id) wins.p2++;
          }
          return (
            <li key={match.id}>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {match.player1.username} vs {match.player2.username}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="tabular-nums">
                        {wins.p1}-{wins.p2}
                      </Badge>
                      <Badge
                        variant={
                          match.status === "DISPUTED" || match.status === "EXPIRED" ? "warning" : "outline"
                        }
                      >
                        {match.status.toLowerCase()}
                      </Badge>
                    </div>
                  </div>
                  {match.roomCode && (
                    <p className="mt-1 text-xs text-muted-foreground">Room code: {match.roomCode}</p>
                  )}

                  <ForceConfirmMatchForm
                    player1Username={match.player1.username}
                    player2Username={match.player2.username}
                    actionForPlayer1={forceConfirmMatchAction.bind(null, match.id, match.player1.id)}
                    actionForPlayer2={forceConfirmMatchAction.bind(null, match.id, match.player2.id)}
                  />

                  <EditGameScoreForm
                    player1Username={match.player1.username}
                    player2Username={match.player2.username}
                    games={match.games.map((g) => ({
                      gameNumber: g.gameNumber,
                      winnerUsername:
                        g.winnerId === match.player1.id
                          ? match.player1.username
                          : g.winnerId === match.player2.id
                            ? match.player2.username
                            : null,
                      setPlayer1Action: setGameWinnerAction.bind(null, match.id, g.gameNumber, match.player1.id),
                      clearAction: setGameWinnerAction.bind(null, match.id, g.gameNumber, null),
                      setPlayer2Action: setGameWinnerAction.bind(null, match.id, g.gameNumber, match.player2.id),
                    }))}
                    resetAction={resetMatchAction.bind(null, match.id)}
                  />

                  <div className="mt-3">
                    <CancelMatchButton action={cancelMatchAction.bind(null, match.id)} />
                  </div>

                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Chatroom ({comments[i].length})
                    </summary>
                    <div className="mt-2 flex flex-col gap-2">
                      {comments[i].length === 0 && (
                        <p className="text-muted-foreground">No messages yet.</p>
                      )}
                      {comments[i].map((c) => (
                        <p key={c.id}>
                          <span className="font-medium">{c.author.username}:</span> {c.body}
                        </p>
                      ))}
                      <form action={postLiveMatchComment.bind(null, match.id)} className="mt-1 flex items-end gap-2">
                        <input
                          name="body"
                          required
                          maxLength={500}
                          placeholder="Message both players as a mod…"
                          autoComplete="off"
                          className="h-8 w-full rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Send
                        </Button>
                      </form>
                    </div>
                  </details>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
