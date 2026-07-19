import Link from "next/link";
import { Swords } from "lucide-react";
import { prisma } from "@/lib/db";
import { SMASH_CHARACTERS } from "@/lib/characters";
import { CharacterIcon } from "@/components/character-icon";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default async function CharactersPage() {
  const counts = await prisma.user.groupBy({
    by: ["mainCharacter"],
    where: { mainCharacter: { not: null }, gamesPlayed: { gte: 10 } },
    _count: { mainCharacter: true },
  });
  const countByCharacter = new Map(counts.map((c) => [c.mainCharacter, c._count.mainCharacter]));

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Swords className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Characters</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Mains are set by whoever you played against, not by yourself — ask an opponent to report
        it after a match. Browse a character&apos;s leaderboard below.
      </p>

      <Card className="mt-8 divide-y divide-border overflow-hidden py-0">
        {SMASH_CHARACTERS.map((c) => (
          <Link
            key={c}
            href={`/leaderboard?character=${encodeURIComponent(c)}`}
            className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent"
          >
            <CharacterIcon name={c} />
            <span className="flex-1">{c}</span>
            {countByCharacter.has(c) && (
              <Badge variant="outline" className="tabular-nums">
                {countByCharacter.get(c)}
              </Badge>
            )}
          </Link>
        ))}
      </Card>
    </main>
  );
}
