import Image from "next/image";
import { Loader2, Swords } from "lucide-react";
import { auth } from "@/auth";
import { getActiveLobbyEntry } from "@/lib/lobby";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LobbyPoller } from "@/components/lobby-poller";
import { cancelLobby, joinLobby, reportResult, submitRoomCode } from "./actions";

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
          <CardContent className="pt-4">
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

function PairedView({
  userId,
  match,
}: {
  userId: string;
  match: NonNullable<NonNullable<Awaited<ReturnType<typeof getActiveLobbyEntry>>>["match"]>;
}) {
  const opponent = match.player1Id === userId ? match.player2 : match.player1;

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
      </CardContent>

      <CardContent>
        <RoomCodeForm matchId={match.id} initialValue={match.roomCode ?? ""} />
      </CardContent>

      <ResultSection userId={userId} match={match} opponentName={opponent.username} />
    </Card>
  );
}

function ResultSection({
  userId,
  match,
  opponentName,
}: {
  userId: string;
  match: NonNullable<NonNullable<Awaited<ReturnType<typeof getActiveLobbyEntry>>>["match"]>;
  opponentName: string;
}) {
  if (match.status === "PENDING_REPORT") {
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          Report the result once you&apos;ve played.
        </p>
        <div className="mt-4 flex gap-2">
          <form action={reportResult.bind(null, match.id, true)}>
            <Button type="submit">I Won</Button>
          </form>
          <form action={reportResult.bind(null, match.id, false)}>
            <Button type="submit" variant="outline">
              I Lost
            </Button>
          </form>
        </div>
      </CardContent>
    );
  }

  if (match.status === "REPORTED" && match.reportedById === userId) {
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          Waiting for {opponentName} to confirm the result…
        </p>
        <LobbyPoller />
      </CardContent>
    );
  }

  if (match.status === "REPORTED" && match.reportedById !== userId) {
    const theyClaimedTheyWon = match.reportedWinnerId !== userId;
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          {opponentName} reported that {theyClaimedTheyWon ? "they won" : "you won"}. Does that
          match what happened?
        </p>
        <div className="mt-4 flex gap-2">
          <form action={reportResult.bind(null, match.id, !theyClaimedTheyWon)}>
            <Button type="submit">Yes, that&apos;s right</Button>
          </form>
          <form action={reportResult.bind(null, match.id, theyClaimedTheyWon)}>
            <Button type="submit" variant="outline">
              No, that&apos;s wrong
            </Button>
          </form>
        </div>
      </CardContent>
    );
  }

  if (match.status === "CONFIRMED") {
    const won = match.reportedWinnerId === userId;
    const ratingBefore =
      match.player1Id === userId ? match.player1RatingBefore : match.player2RatingBefore;
    const ratingAfter =
      match.player1Id === userId ? match.player1RatingAfter : match.player2RatingAfter;
    const delta = (ratingAfter ?? 0) - (ratingBefore ?? 0);

    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm font-medium">Match confirmed — you {won ? "won" : "lost"}</p>
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

  if (match.status === "DISPUTED") {
    return (
      <CardContent className="border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          You and {opponentName} reported different results. This match is awaiting review.
        </p>
      </CardContent>
    );
  }

  return null;
}

function RoomCodeForm({ matchId, initialValue }: { matchId: string; initialValue: string }) {
  async function action(formData: FormData) {
    "use server";
    const roomCode = String(formData.get("roomCode") ?? "");
    await submitRoomCode(matchId, roomCode);
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
