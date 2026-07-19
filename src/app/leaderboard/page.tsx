import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function LeaderboardPage() {
  const players = await prisma.user.findMany({
    where: { gamesPlayed: { gte: 10 } }, // provisional players excluded, per rating design
    orderBy: { rating: "desc" },
    select: { id: true, username: true, rating: true, gamesPlayed: true },
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
      <p className="mt-1 text-sm text-zinc-500">Ranked players with 10+ games played.</p>

      <table className="mt-8 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <th className="py-2 font-medium">#</th>
            <th className="py-2 font-medium">Player</th>
            <th className="py-2 font-medium text-right tabular-nums">Rating</th>
            <th className="py-2 font-medium text-right tabular-nums">Games</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, index) => (
            <tr key={player.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 tabular-nums">{index + 1}</td>
              <td className="py-2">
                <Link href={`/players/${player.id}`} className="hover:underline">
                  {player.username}
                </Link>
              </td>
              <td className="py-2 text-right font-medium tabular-nums">{player.rating}</td>
              <td className="py-2 text-right tabular-nums">{player.gamesPlayed}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {players.length === 0 && (
        <p className="mt-8 text-sm text-zinc-500">No ranked players yet.</p>
      )}
    </main>
  );
}
