import Image from "next/image";
import { auth } from "@/auth";
import { getActiveLobbyEntry } from "@/lib/lobby";
import { Button } from "@/components/ui/button";
import { LobbyPoller } from "@/components/lobby-poller";
import { cancelLobby, joinLobby, reportResult, submitRoomCode } from "./actions";

export default async function LobbyPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Lobby</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Sign in with Discord (top right) to join the matchmaking lobby.
        </p>
      </main>
    );
  }

  const entry = await getActiveLobbyEntry(session.user.id);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Lobby</h1>

      {!entry && (
        <div className="mt-8">
          <p className="text-sm text-zinc-500">You&apos;re not in the queue.</p>
          <form action={joinLobby} className="mt-4">
            <Button type="submit">Join Lobby</Button>
          </form>
        </div>
      )}

      {entry?.status === "WAITING" && (
        <div className="mt-8">
          <p className="text-sm text-zinc-500">Waiting for an opponent…</p>
          <form action={cancelLobby} className="mt-4">
            <Button type="submit" variant="outline">
              Cancel
            </Button>
          </form>
          <LobbyPoller />
        </div>
      )}

      {entry?.status === "PAIRED" && entry.match && (
        <PairedView userId={session.user.id} match={entry.match} />
      )}
    </main>
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
    <div className="mt-8">
      <p className="text-sm text-zinc-500">Matched!</p>
      <div className="mt-4 flex items-center gap-3">
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
          <p className="text-sm text-zinc-500 tabular-nums">{opponent.rating} rating</p>
        </div>
      </div>

      <RoomCodeForm matchId={match.id} initialValue={match.roomCode ?? ""} />

      <ResultSection userId={userId} match={match} opponentName={opponent.username} />
    </div>
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
      <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Report the result once you&apos;ve played.</p>
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
      </div>
    );
  }

  if (match.status === "REPORTED" && match.reportedById === userId) {
    return (
      <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Waiting for {opponentName} to confirm the result…</p>
        <LobbyPoller />
      </div>
    );
  }

  if (match.status === "REPORTED" && match.reportedById !== userId) {
    const theyClaimedTheyWon = match.reportedWinnerId !== userId;
    return (
      <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">
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
      </div>
    );
  }

  if (match.status === "CONFIRMED") {
    const won = match.reportedWinnerId === userId;
    const ratingBefore = match.player1Id === userId ? match.player1RatingBefore : match.player2RatingBefore;
    const ratingAfter = match.player1Id === userId ? match.player1RatingAfter : match.player2RatingAfter;
    const delta = (ratingAfter ?? 0) - (ratingBefore ?? 0);

    return (
      <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <p className="text-sm font-medium">
          Match confirmed — you {won ? "won" : "lost"}
        </p>
        <p className="mt-1 text-sm text-zinc-500 tabular-nums">
          {ratingBefore} → {ratingAfter} ({delta >= 0 ? "+" : ""}
          {delta})
        </p>
        <form action={joinLobby} className="mt-4">
          <Button type="submit">Join Lobby</Button>
        </form>
      </div>
    );
  }

  if (match.status === "DISPUTED") {
    return (
      <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">
          You and {opponentName} reported different results. This match is awaiting review.
        </p>
      </div>
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
    <form action={action} className="mt-6 flex items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        Room code
        <input
          name="roomCode"
          defaultValue={initialValue}
          placeholder="e.g. AB12CD"
          className="h-8 w-40 rounded-lg border border-zinc-300 bg-transparent px-2.5 text-sm outline-none focus-visible:border-zinc-500 dark:border-zinc-700"
        />
      </label>
      <Button type="submit" size="sm">
        Save
      </Button>
    </form>
  );
}
