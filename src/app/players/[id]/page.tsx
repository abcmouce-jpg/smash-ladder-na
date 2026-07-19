import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cable, MapPin } from "lucide-react";
import {
  currentStreak,
  getPlayerMatchHistory,
  getPlayerProfile,
  getRatingChartPoints,
} from "@/lib/players";
import { CharacterIcon } from "@/components/character-icon";
import { RatingChart } from "@/components/rating-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await getPlayerProfile(id);
  if (!player) notFound();

  const [history, chartPoints] = await Promise.all([
    getPlayerMatchHistory(id),
    getRatingChartPoints(id),
  ]);
  const wins = history.filter((m) => m.won).length;
  const losses = history.length - wins;
  const winRate = history.length > 0 ? Math.round((wins / history.length) * 100) : null;
  const streak = currentStreak(history);

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
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {player.username}
            {player.mainCharacter && <CharacterIcon name={player.mainCharacter} size={22} />}
          </h1>
          <p className="text-sm tabular-nums text-muted-foreground">
            {player.rating} rating · {player.gamesPlayed} games played
            {player.mainCharacter ? ` · mains ${player.mainCharacter}` : ""}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            {player.region && (
              <Badge variant="outline">
                <MapPin className="size-3" />
                {player.region}
              </Badge>
            )}
            {player.wiredConnection && (
              <Badge variant="outline">
                <Cable className="size-3" />
                Wired
              </Badge>
            )}
            {player.noShowCount > 0 && (
              <Badge variant="warning">{player.noShowCount} no-show{player.noShowCount === 1 ? "" : "s"}</Badge>
            )}
            {player.cancelCount > 0 && (
              <Badge variant="warning">
                {player.cancelCount} cancel{player.cancelCount === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {chartPoints.length >= 2 && (
        <Card className="mt-8">
          <CardContent className="pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Rating over time</p>
              <div className="flex gap-2">
                {winRate !== null && (
                  <Badge variant="outline" className="tabular-nums">
                    {winRate}% win rate
                  </Badge>
                )}
                {streak !== 0 && (
                  <Badge variant={streak > 0 ? "success" : "destructive"} className="tabular-nums">
                    {Math.abs(streak)} {streak > 0 ? "win" : "loss"} streak
                  </Badge>
                )}
              </div>
            </div>
            <RatingChart points={chartPoints.map((p) => ({ date: p.date.toISOString(), rating: p.rating }))} />
          </CardContent>
        </Card>
      )}

      <div className="mt-10">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Recent matches</h2>
          {history.length > 0 && (
            <Badge variant="outline">
              {wins}W–{losses}L of last {history.length}
            </Badge>
          )}
        </div>

        {history.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">No confirmed matches yet.</p>
        )}

        {history.length > 0 && (
          <Card className="mt-4 divide-y divide-border overflow-hidden py-0">
            {history.map((match) => (
              <div
                key={match.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span className="flex items-center gap-2">
                  <Badge variant={match.won ? "success" : "destructive"} className="w-6 justify-center">
                    {match.won ? "W" : "L"}
                  </Badge>
                  vs{" "}
                  <Link href={`/players/${match.opponent.id}`} className="hover:underline">
                    {match.opponent.username}
                  </Link>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {match.ratingBefore} → {match.ratingAfter} ({match.delta >= 0 ? "+" : ""}
                  {match.delta})
                </span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </main>
  );
}
