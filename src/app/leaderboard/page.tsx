import Link from "next/link";
import { Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { SMASH_CHARACTERS } from "@/lib/characters";
import { ensureActiveSeason } from "@/lib/seasons";
import { CharacterIcon } from "@/components/character-icon";
import { RankBadge } from "@/components/rank-badge";
import { AdSlot } from "@/components/ad-slot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ character?: string }>;
}) {
  const { character } = await searchParams;
  const isValidCharacter = character && (SMASH_CHARACTERS as readonly string[]).includes(character);

  const season = await ensureActiveSeason();
  const players = await prisma.user.findMany({
    where: {
      gamesPlayed: { gte: 10 }, // provisional players excluded, per rating design
      ...(isValidCharacter ? { mainCharacter: character } : {}),
    },
    orderBy: { rating: "desc" },
    select: { id: true, username: true, rating: true, gamesPlayed: true, mainCharacter: true },
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <Badge variant="outline">{season.name}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Ranked players with 10+ games played
        {isValidCharacter ? ` who main ${character}` : ""}.
      </p>

      <form method="get" className="mt-4 flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Character
          <select
            name="character"
            defaultValue={isValidCharacter ? character : ""}
            className="h-8 w-48 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
          >
            <option value="" className="bg-background text-foreground">
              All players
            </option>
            {SMASH_CHARACTERS.map((c) => (
              <option key={c} value={c} className="bg-background text-foreground">
                {c}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" variant="outline">
          Filter
        </Button>
      </form>

      <Card className="mt-6 overflow-hidden py-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pl-4 font-medium">#</th>
              <th className="py-2 font-medium">Player</th>
              <th className="py-2 font-medium">Tier</th>
              <th className="py-2 font-medium text-right tabular-nums">Rating</th>
              <th className="py-2 pr-4 font-medium text-right tabular-nums">Games</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => (
              <tr
                key={player.id}
                className={`border-b border-border/60 last:border-0 ${
                  index < 3 ? "bg-primary/[0.04]" : ""
                }`}
              >
                <td className="py-2 pl-4 tabular-nums text-muted-foreground">
                  {MEDALS[index] ?? index + 1}
                </td>
                <td className="py-2">
                  <Link
                    href={`/players/${player.id}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    {player.mainCharacter && <CharacterIcon name={player.mainCharacter} size={20} />}
                    {player.username}
                  </Link>
                </td>
                <td className="py-2">
                  <RankBadge rating={player.rating} gamesPlayed={player.gamesPlayed} />
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

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_LEADERBOARD} />
    </main>
  );
}
