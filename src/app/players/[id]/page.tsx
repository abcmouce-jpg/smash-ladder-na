import Image from "next/image";
import { notFound } from "next/navigation";
import { getPlayerMatchHistory, getPlayerProfile } from "@/lib/players";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await getPlayerProfile(id);
  if (!player) notFound();

  const history = await getPlayerMatchHistory(id);
  const wins = history.filter((m) => m.won).length;
  const losses = history.length - wins;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-4">
        {player.avatarUrl && (
          <Image
            src={player.avatarUrl}
            alt={player.username}
            width={56}
            height={56}
            className="rounded-full"
          />
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{player.username}</h1>
          <p className="text-sm text-zinc-500 tabular-nums">
            {player.rating} rating · {player.gamesPlayed} games played
          </p>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-sm font-medium text-zinc-500">
          Recent matches ({wins}W–{losses}L of last {history.length})
        </h2>

        {history.length === 0 && (
          <p className="mt-4 text-sm text-zinc-500">No confirmed matches yet.</p>
        )}

        <ul className="mt-4 flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
          {history.map((match) => (
            <li key={match.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {match.won ? "W" : "L"} vs {match.opponent.username}
              </span>
              <span className="tabular-nums text-zinc-500">
                {match.ratingBefore} → {match.ratingAfter} ({match.delta >= 0 ? "+" : ""}
                {match.delta})
              </span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
