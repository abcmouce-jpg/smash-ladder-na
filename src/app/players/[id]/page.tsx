import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cable, MapPin } from "lucide-react";
import { getPlayerMatchHistory, getPlayerProfile } from "@/lib/players";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

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
          </div>
        </div>
      </div>

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
