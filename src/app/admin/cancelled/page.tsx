import { Undo2 } from "lucide-react";
import { auth } from "@/auth";
import { listConvertibleCancelledMatches } from "@/lib/matches";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { confirmCancelled } from "./actions";

// Only lists sets that can still be converted — see
// cancelledMatchIsConvertible. A cancel stops being reversible the moment
// either player's next rated set confirms, so this page empties itself as
// people keep playing rather than offering buttons that would be refused.
export default async function CancelledPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user?.id || (role !== "MOD" && role !== "ADMIN")) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Cancelled sets</h1>
        <p className="mt-2 text-sm text-muted-foreground">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const matches = await listConvertibleCancelledMatches();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Undo2 className="size-5" />
        Cancelled sets
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Turn a cancelled set into a win — for the case where someone quit and the other player hit cancel instead of
        reporting it. Rating, record and history are written the same way a normal report would write them.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Only sets neither player has played a rated set since are listed. After that, the result can&apos;t be inserted
        without recomputing every rating that came after it, so the set drops off this list for good.
      </p>

      {matches.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Nothing here — no cancelled set is still reversible.</p>
      ) : (
        <div className="mt-8 flex flex-col gap-3">
          {matches.map((match) => (
            <Card key={match.id}>
              <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <div className="font-medium">
                    {match.player1.username} <span className="text-muted-foreground">vs</span> {match.player2.username}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {match.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC ·{" "}
                    {Math.round(match.player1.rating)} / {Math.round(match.player2.rating)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={confirmCancelled.bind(null, match.id, match.player1Id)}>
                    <Button type="submit" size="sm" variant="outline">
                      {match.player1.username} won
                    </Button>
                  </form>
                  <form action={confirmCancelled.bind(null, match.id, match.player2Id)}>
                    <Button type="submit" size="sm" variant="outline">
                      {match.player2.username} won
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
