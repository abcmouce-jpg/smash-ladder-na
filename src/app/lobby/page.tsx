import Image from "next/image";
import { auth } from "@/auth";
import { getActiveLobbyEntry } from "@/lib/lobby";
import { Button } from "@/components/ui/button";
import { LobbyPoller } from "@/components/lobby-poller";
import { cancelLobby, joinLobby, submitRoomCode } from "./actions";

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
    </div>
  );
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
