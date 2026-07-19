import { Shield } from "lucide-react";
import { auth } from "@/auth";
import { listDisputedMatches } from "@/lib/disputes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cancelDispute, resolveDispute } from "./actions";

type DisputedMatch = Awaited<ReturnType<typeof listDisputedMatches>>[number];

function nameFor(match: DisputedMatch, userId: string | null) {
  if (!userId) return "no one";
  return userId === match.player1Id ? match.player1.username : match.player2.username;
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

  const matches = await listDisputedMatches();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Shield className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Disputes</h1>
      </div>

      {matches.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No disputed matches.</p>
      )}

      <ul className="mt-6 flex flex-col gap-4">
        {matches.map((match) => (
          <li key={match.id}>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {match.player1.username} vs {match.player2.username}
                  </p>
                  <Badge variant="warning">disputed</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {nameFor(match, match.reportedById)} reported{" "}
                  {nameFor(match, match.reportedWinnerId)} won.{" "}
                  {nameFor(match, match.secondReportById)} reported{" "}
                  {nameFor(match, match.secondReportWinnerId)} won.
                </p>
                {match.roomCode && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Room code: {match.roomCode}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={resolveDispute.bind(null, match.id, match.player1Id)}>
                    <Button type="submit" size="sm">
                      {match.player1.username} won
                    </Button>
                  </form>
                  <form action={resolveDispute.bind(null, match.id, match.player2Id)}>
                    <Button type="submit" size="sm">
                      {match.player2.username} won
                    </Button>
                  </form>
                  <form action={cancelDispute.bind(null, match.id)}>
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
