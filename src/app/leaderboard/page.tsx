import Link from "next/link";
import { Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage() {
  const players = await prisma.user.findMany({
    where: { gamesPlayed: { gte: 10 } }, // provisional players excluded, per rating design
    orderBy: { rating: "desc" },
    select: { id: true, username: true, rating: true, gamesPlayed: true },
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Ranked players with 10+ games played.</p>

      <Card className="mt-8 overflow-hidden py-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pl-4 font-medium">#</th>
              <th className="py-2 font-medium">Player</th>
              <th className="py-2 font-medium text-right tabular-nums">Rating</th>
              <th className="py-2 pr-4 font-medium text-right tabular-nums">Games</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => (
              <tr key={player.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pl-4 tabular-nums text-muted-foreground">
                  {MEDALS[index] ?? index + 1}
                </td>
                <td className="py-2">
                  <Link href={`/players/${player.id}`} className="hover:underline">
                    {player.username}
                  </Link>
                </td>
                <td className="py-2 text-right font-medium tabular-nums">{player.rating}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                  {player.gamesPlayed}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {players.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No ranked players yet.</p>
        )}
      </Card>

      {players.length > 0 && (
        <Badge variant="outline" className="mt-4">
          {players.length} ranked player{players.length === 1 ? "" : "s"}
        </Badge>
      )}
    </main>
  );
}
