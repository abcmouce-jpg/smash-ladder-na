import Link from "next/link";
import { Swords } from "lucide-react";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { UserStatus } from "@/generated/prisma/enums";
import { SMASH_CHARACTERS, echoGroupCanonical, echoGroupLabel, echoGroupMembers, type SmashCharacter } from "@/lib/characters";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { CharacterIcon } from "@/components/character-icon";
import { AdSlot } from "@/components/ad-slot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLang } from "@/lib/i18n";

const SORT_OPTIONS = ["alpha", "players"] as const;

export default async function CharactersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const isValidSort = sort && (SORT_OPTIONS as readonly string[]).includes(sort);
  const lang = await getLang();

  // Same inclusion rules as the per-character leaderboard itself
  // (getLeaderboardPlayers): the leaderboard's games floor — deliberately
  // lower than the 10-game tier threshold, so provisional players count —
  // plus no banned or Discord-self-deleted accounts. The count then matches
  // how many players actually appear on /leaderboard?character=X.
  const leaderboardWhere: Prisma.UserWhereInput = {
    gamesPlayed: { gte: LEADERBOARD_MIN_GAMES },
    status: { not: UserStatus.BANNED },
    username: { not: "Deleted User" },
  };

  const [mainCounts, secondaryUsers] = await Promise.all([
    prisma.user.groupBy({
      by: ["mainCharacter"],
      where: { ...leaderboardWhere, mainCharacter: { not: null } },
      _count: { mainCharacter: true },
    }),
    prisma.user.findMany({
      where: { ...leaderboardWhere, secondaryCharacters: { isEmpty: false } },
      select: { mainCharacter: true, secondaryCharacters: true },
    }),
  ]);
  const countByCharacter = new Map<string, number>();
  for (const c of mainCounts) {
    if (c.mainCharacter) countByCharacter.set(c.mainCharacter, c._count.mainCharacter);
  }

  // Secondaries also put a player on that character's leaderboard — they
  // require >10% of a player's games to exist at all (see
  // recomputeCharacterUsage), so the count matches what filtering by the
  // character shows. Dedupes to canonical echo groups so a Peach main with
  // Daisy as a secondary doesn't double-count the Peach/Daisy row, and
  // skips a secondary inside the player's own main's group.
  const canonical = (c: string) => echoGroupCanonical(c as SmashCharacter);
  for (const u of secondaryUsers) {
    const groups = new Set(u.secondaryCharacters.map(canonical));
    if (u.mainCharacter) groups.delete(canonical(u.mainCharacter));
    for (const group of groups) {
      countByCharacter.set(group, (countByCharacter.get(group) ?? 0) + 1);
    }
  }

  // One row per echo group (Peach absorbs Daisy, etc.) rather than one per
  // roster entry — echoes are functionally the same fighter, so splitting
  // their usage counts across separate rows just undercounts both. Filters
  // to only each group's canonical member so an echo doesn't also get its
  // own separate row.
  const rows = SMASH_CHARACTERS.filter((c) => echoGroupCanonical(c) === c).map((c) => ({
    character: c,
    label: echoGroupLabel(c),
    count: echoGroupMembers(c).reduce((sum, member) => sum + (countByCharacter.get(member) ?? 0), 0),
  }));

  if (sort === "alpha") {
    rows.sort((a, b) => a.label.localeCompare(b.label));
  } else if (sort === "players") {
    rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }
  // No sort param keeps the roster order SMASH_CHARACTERS already provides.

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Swords className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          {lang === "es" ? "Personajes" : "Characters"}
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {lang === "es" ? (
          <>
            Los mains y secundarios se calculan automáticamente a partir de tu historial real de
            partidas — un secundario necesita 10%+ de tus partidas para contar. La mayoría de los
            personajes echo (Dark Pit, Daisy, Dark Samus, Richter) se cuentan junto con su
            personaje base — Marth/Lucina, Roy/Chrom, y Ryu/Ken se mantienen aparte. Explora la
            tabla de posiciones de un personaje abajo.
          </>
        ) : (
          <>
            Mains and secondaries are computed automatically from your actual match history — a
            secondary needs 10%+ of your games to count. Most echo fighters (Dark Pit, Daisy, Dark
            Samus, Richter) are counted together with their base fighter — Marth/Lucina, Roy/Chrom,
            and Ryu/Ken are kept separate. Browse a character&apos;s leaderboard below.
          </>
        )}
      </p>

      <form method="get" className="mt-8 flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {lang === "es" ? "Ordenar por" : "Sort by"}
          <select
            name="sort"
            defaultValue={isValidSort ? sort : ""}
            className="h-8 w-48 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
          >
            <option value="" className="bg-background text-foreground">
              {lang === "es" ? "Orden del roster" : "Roster order"}
            </option>
            <option value="alpha" className="bg-background text-foreground">
              {lang === "es" ? "Alfabético" : "Alphabetical"}
            </option>
            <option value="players" className="bg-background text-foreground">
              {lang === "es" ? "Más jugadores" : "Most players"}
            </option>
          </select>
        </label>
        <Button type="submit" size="sm" variant="outline">
          {lang === "es" ? "Ordenar" : "Sort"}
        </Button>
      </form>

      <Card className="mt-4 divide-y divide-border overflow-hidden py-0">
        {rows.map(({ character, label, count }) => (
          <Link
            key={character}
            href={`/leaderboard?character=${encodeURIComponent(character)}`}
            className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent"
          >
            <CharacterIcon name={character} />
            <span className="flex-1">{label}</span>
            {count > 0 && (
              <Badge variant="outline" className="tabular-nums">
                {count}
              </Badge>
            )}
          </Link>
        ))}
      </Card>

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_CHARACTERS} />
    </main>
  );
}
