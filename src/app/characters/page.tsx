import Link from "next/link";
import { Swords } from "lucide-react";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { MatchStatus, UserStatus } from "@/generated/prisma/enums";
import { SMASH_CHARACTERS, echoGroupCanonical, echoGroupLabel, type SmashCharacter } from "@/lib/characters";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { getActiveSeason } from "@/lib/seasons";
import { CharacterIcon } from "@/components/character-icon";
import { winRateVariant } from "@/components/character-usage-card";
import { OptionSelect, type OptionSelectOption } from "@/components/option-select";
import { AdSlot } from "@/components/ad-slot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLang } from "@/lib/i18n";

// Accepted ?sort= values — one per sortable column, plus alpha (character
// name). No value means the roster order SMASH_CHARACTERS already provides.
const SORT_KEYS = ["alpha", "players", "mains", "games", "winrate", "rating"] as const;

export default async function CharactersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const isValidSort = sort && (SORT_KEYS as readonly string[]).includes(sort);
  const lang = await getLang();

  const sortOptions: OptionSelectOption[] = [
    { value: "alpha", label: lang === "es" ? "Personaje (A–Z)" : "Character (A–Z)" },
    { value: "players", label: lang === "es" ? "Jugadores" : "Players" },
    { value: "mains", label: "Mains" },
    { value: "games", label: lang === "es" ? "Juegos" : "Games" },
    { value: "winrate", label: lang === "es" ? "Tasa de victorias" : "Win rate" },
    { value: "rating", label: lang === "es" ? "Clasificación media" : "Avg Rating" },
  ];
  const season = await getActiveSeason();

  // Same inclusion rules as the per-character leaderboard itself
  // (getLeaderboardPlayers): the leaderboard's games floor — deliberately
  // lower than the 10-game tier threshold, so provisional players count —
  // plus no banned or Discord-self-deleted accounts. Every column scopes to
  // this same population, and to the active season, since User.gamesPlayed
  // and rating reset at each rollover — the leaderboard is season-scoped
  // too, so all-time games would mix timeframes with the player counts.
  const leaderboardWhere: Prisma.UserWhereInput = {
    gamesPlayed: { gte: LEADERBOARD_MIN_GAMES },
    status: { not: UserStatus.BANNED },
    username: { not: "Deleted User" },
  };

  const canonical = (c: string) => echoGroupCanonical(c as SmashCharacter);

  const [leaderboardPlayers, rankedGames] = await Promise.all([
    // One pass over the leaderboard population covers three columns: Mains
    // (mainCharacter), Players (mains + secondaries), and the ratings that
    // feed Average Rating. Secondaries dedupe to canonical echo groups so a
    // Peach main with Daisy as a secondary doesn't double-count the
    // Peach/Daisy row, and a secondary inside the player's own main's group
    // is skipped — the same counting the page's old groupBy/findMany pair
    // did, so Players still matches /leaderboard?character=X.
    prisma.user.findMany({
      where: leaderboardWhere,
      select: { id: true, mainCharacter: true, secondaryCharacters: true, rating: true },
    }),
    // Per-character games and wins from confirmed, winner-decided games this
    // season — the same "confirmed + winner recorded" filter getCharacterUsage
    // uses. Eligibility is checked per side in JS because MatchGame doesn't
    // relate back to User; a practicing side's games are skipped the same way
    // notPracticingFor does per player, so only ranked games count.
    prisma.matchGame.findMany({
      where: {
        winnerId: { not: null },
        match: { status: MatchStatus.CONFIRMED, seasonId: season?.id ?? null },
      },
      select: {
        actorAId: true,
        actorACharacter: true,
        actorBId: true,
        actorBCharacter: true,
        winnerId: true,
        match: {
          select: { player1Id: true, player2Id: true, player1IsPracticing: true, player2IsPracticing: true },
        },
      },
    }),
  ]);
  const eligibleIds = new Set(leaderboardPlayers.map((u) => u.id));

  const mainsByGroup = new Map<string, number>();
  const playersByGroup = new Map<string, number>();
  const ratingSumByGroup = new Map<string, number>();
  const gamesByGroup = new Map<string, { games: number; wins: number }>();

  for (const u of leaderboardPlayers) {
    const mainGroup = u.mainCharacter ? canonical(u.mainCharacter) : null;
    const secondaryGroups = new Set(u.secondaryCharacters.map(canonical));
    if (mainGroup) secondaryGroups.delete(mainGroup);

    if (mainGroup) {
      mainsByGroup.set(mainGroup, (mainsByGroup.get(mainGroup) ?? 0) + 1);
      playersByGroup.set(mainGroup, (playersByGroup.get(mainGroup) ?? 0) + 1);
      ratingSumByGroup.set(mainGroup, (ratingSumByGroup.get(mainGroup) ?? 0) + u.rating);
    }
    for (const group of secondaryGroups) {
      playersByGroup.set(group, (playersByGroup.get(group) ?? 0) + 1);
      ratingSumByGroup.set(group, (ratingSumByGroup.get(group) ?? 0) + u.rating);
    }
  }

  for (const g of rankedGames) {
    const sides = [
      { actorId: g.actorAId, character: g.actorACharacter },
      { actorId: g.actorBId, character: g.actorBCharacter },
    ];
    for (const { actorId, character } of sides) {
      if (!character || !eligibleIds.has(actorId)) continue;
      const practicing =
        (g.match.player1Id === actorId && g.match.player1IsPracticing) ||
        (g.match.player2Id === actorId && g.match.player2IsPracticing);
      if (practicing) continue;
      const group = canonical(character);
      const entry = gamesByGroup.get(group) ?? { games: 0, wins: 0 };
      entry.games++;
      if (g.winnerId === actorId) entry.wins++;
      gamesByGroup.set(group, entry);
    }
  }

  // One row per echo group (Peach absorbs Daisy, etc.) rather than one per
  // roster entry — echoes are functionally the same fighter, so splitting
  // their usage counts across separate rows just undercounts both. Filters
  // to only each group's canonical member so an echo doesn't also get its
  // own separate row.
  const rows = SMASH_CHARACTERS.filter((c) => echoGroupCanonical(c) === c).map((c) => {
    const games = gamesByGroup.get(c) ?? { games: 0, wins: 0 };
    const players = playersByGroup.get(c) ?? 0;
    return {
      character: c,
      label: echoGroupLabel(c),
      players,
      mains: mainsByGroup.get(c) ?? 0,
      games: games.games,
      winRate: games.games > 0 ? Math.round((games.wins / games.games) * 100) : null,
      avgRating: players > 0 ? Math.round((ratingSumByGroup.get(c) ?? 0) / players) : null,
    };
  });

  if (sort === "alpha") {
    rows.sort((a, b) => a.label.localeCompare(b.label));
  } else if (sort === "players") {
    rows.sort((a, b) => b.players - a.players || a.label.localeCompare(b.label));
  } else if (sort === "mains") {
    rows.sort((a, b) => b.mains - a.mains || a.label.localeCompare(b.label));
  } else if (sort === "games") {
    rows.sort((a, b) => b.games - a.games || a.label.localeCompare(b.label));
  } else if (sort === "winrate") {
    // Characters with no ranked games (null win rate) sort to the bottom.
    rows.sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || a.label.localeCompare(b.label));
  } else if (sort === "rating") {
    // Characters with no players (null average rating) sort to the bottom.
    rows.sort((a, b) => (b.avgRating ?? -1) - (a.avgRating ?? -1) || a.label.localeCompare(b.label));
  }
  // No sort param keeps the roster order SMASH_CHARACTERS already provides.

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Swords className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          {lang === "es" ? "Personajes" : "Characters"}
        </h1>
        {season && <Badge variant="outline">{season.name}</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {lang === "es" ? (
          <>
            Los mains y secundarios se calculan automáticamente a partir de tu historial real de
            partidas — un secundario necesita 10%+ de tus partidas para contar. La mayoría de los
            personajes echo (Dark Pit, Daisy, Dark Samus, Richter) se cuentan junto con su
            personaje base — Marth/Lucina, Roy/Chrom, y Ryu/Ken se mantienen aparte. Los juegos y
            la tasa de victorias cubren los juegos rankeados de la temporada actual. Explora la
            tabla de posiciones de un personaje abajo.
          </>
        ) : (
          <>
            Mains and secondaries are computed automatically from your actual match history — a
            secondary needs 10%+ of your games to count. Most echo fighters (Dark Pit, Daisy, Dark
            Samus, Richter) are counted together with their base fighter — Marth/Lucina, Roy/Chrom,
            and Ryu/Ken are kept separate. Games and win rate cover ranked games from the current
            season. Browse a character&apos;s leaderboard below.
          </>
        )}
      </p>

      <form method="get" className="mt-8 flex flex-wrap items-end gap-2">
        <label className="flex w-full flex-col gap-1 text-sm md:w-auto">
          {lang === "es" ? "Ordenar por" : "Sort by"}
          <OptionSelect
            key={isValidSort ? sort : ""}
            name="sort"
            defaultValue={isValidSort ? sort : ""}
            placeholder={lang === "es" ? "Orden del roster" : "Roster order"}
            clearLabel={lang === "es" ? "Orden del roster" : "Roster order"}
            className="w-full md:w-48"
            options={sortOptions}
            autoSubmit
          />
        </label>
        <Button type="submit" size="sm" variant="outline" className="h-8 w-full md:w-auto">
          {lang === "es" ? "Ordenar" : "Sort"}
        </Button>
      </form>

      <Card className="mt-4 overflow-hidden py-0">
        {/* Scrolls horizontally instead of clipping columns on narrow viewports */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pl-4 font-medium">
                  {lang === "es" ? "Personaje" : "Character"}
                </th>
                <th className="py-2 font-medium">
                  {lang === "es" ? "Jugadores" : "Players"}
                  <span className="block text-xs font-normal">
                    {lang === "es" ? "mains + secundarios" : "Mains + Secondaries"}
                  </span>
                </th>
                <th className="py-2 text-right font-medium tabular-nums">Mains</th>
                <th className="py-2 text-right font-medium tabular-nums">
                  {lang === "es" ? "Juegos" : "Games"}
                </th>
                <th className="py-2 text-right font-medium tabular-nums">
                  {lang === "es" ? "Tasa de victorias" : "Win rate"}
                </th>
                <th className="py-2 pr-4 text-right font-medium tabular-nums">
                  {lang === "es" ? "Clasificación media" : "Avg Rating"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.character} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pl-4">
                    <Link
                      href={`/leaderboard?character=${encodeURIComponent(row.character)}`}
                      className="flex items-center gap-3 hover:underline"
                    >
                      <CharacterIcon name={row.character} />
                      <span>{row.label}</span>
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums">{row.players}</td>
                  <td className="py-2 text-right tabular-nums">{row.mains}</td>
                  <td className="py-2 text-right tabular-nums">{row.games}</td>
                  <td className="py-2 text-right tabular-nums">
                    {row.winRate === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Badge variant={winRateVariant(row.winRate)} className="px-1.5 py-0">
                        {row.winRate}%
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {row.avgRating === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      row.avgRating
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_CHARACTERS} />
    </main>
  );
}
