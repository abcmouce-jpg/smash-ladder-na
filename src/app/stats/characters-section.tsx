import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { MatchStatus, UserStatus } from "@/generated/prisma/enums";
import { SMASH_CHARACTERS, echoGroupCanonical, echoGroupLabel, type SmashCharacter } from "@/lib/characters";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { getActiveSeason } from "@/lib/seasons";
import { CharacterIcon } from "@/components/character-icon";
import { winRateVariant } from "@/components/character-usage-card";
import { AdSlot } from "@/components/ad-slot";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n";

// One sortable column per header (character name included). No active sort
// keeps the roster order SMASH_CHARACTERS already provides.
const SORT_KEYS = ["alpha", "players", "mains", "games", "winrate", "rating"] as const;
type SortKey = (typeof SORT_KEYS)[number];
const DEFAULT_DIRECTION: Record<SortKey, "asc" | "desc"> = {
  alpha: "asc",
  players: "desc",
  mains: "desc",
  games: "desc",
  winrate: "desc",
  rating: "desc",
};

type Row = {
  character: string;
  label: string;
  players: number;
  mains: number;
  games: number;
  winRate: number | null;
  avgRating: number | null;
};

function compareRows(rows: Row[], key: SortKey, dir: "asc" | "desc") {
  const sign = dir === "asc" ? 1 : -1;
  const byLabel = (a: Row, b: Row) => a.label.localeCompare(b.label);
  if (key === "alpha") {
    rows.sort((a, b) => sign * byLabel(a, b));
  } else if (key === "players") {
    rows.sort((a, b) => sign * (a.players - b.players) || byLabel(a, b));
  } else if (key === "mains") {
    rows.sort((a, b) => sign * (a.mains - b.mains) || byLabel(a, b));
  } else if (key === "games") {
    rows.sort((a, b) => sign * (a.games - b.games) || byLabel(a, b));
  } else if (key === "winrate") {
    // Characters with no ranked games (null win rate) always sort to the
    // bottom, regardless of direction.
    rows.sort((a, b) => {
      if (a.winRate === null && b.winRate === null) return byLabel(a, b);
      if (a.winRate === null) return 1;
      if (b.winRate === null) return -1;
      return sign * (a.winRate - b.winRate) || byLabel(a, b);
    });
  } else {
    rows.sort((a, b) => {
      if (a.avgRating === null && b.avgRating === null) return byLabel(a, b);
      if (a.avgRating === null) return 1;
      if (b.avgRating === null) return -1;
      return sign * (a.avgRating - b.avgRating) || byLabel(a, b);
    });
  }
}

export async function StatsCharactersSection({ lang, sort, dir }: { lang: Lang; sort?: string; dir?: string }) {
  const isValidSort = sort && (SORT_KEYS as readonly string[]).includes(sort as SortKey);
  const sortKey: SortKey | null = isValidSort ? (sort as SortKey) : null;
  const activeDir: "asc" | "desc" | null = sortKey
    ? dir === "asc" || dir === "desc"
      ? dir
      : DEFAULT_DIRECTION[sortKey]
    : null;
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
    prisma.user.findMany({
      where: leaderboardWhere,
      select: { id: true, mainCharacter: true, secondaryCharacters: true, rating: true },
    }),
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
  const rows: Row[] = SMASH_CHARACTERS.filter((c) => echoGroupCanonical(c) === c).map((c) => {
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

  if (sortKey) {
    compareRows(rows, sortKey, activeDir ?? "desc");
  }

  const headerHref = (key: SortKey): string => {
    const direction = sortKey === key ? (activeDir === "asc" ? "desc" : "asc") : DEFAULT_DIRECTION[key];
    const params = new URLSearchParams({ tab: "characters", sort: key, dir: direction });
    return `?${params.toString()}`;
  };

  const HeaderLink = ({
    label,
    col,
    className,
    sub,
  }: {
    label: string;
    col: SortKey;
    className?: string;
    sub?: string;
  }) => {
    const active = sortKey === col;
    return (
      <Link
        href={headerHref(col)}
        prefetch={false}
        aria-sort={active ? (activeDir === "asc" ? "ascending" : "descending") : undefined}
        className={cn(
          "group inline-flex items-center gap-1 transition-colors hover:text-foreground",
          active ? "font-medium text-foreground" : "text-muted-foreground",
          className,
        )}
      >
        <span className="flex flex-col leading-tight">
          <span>{label}</span>
          {sub && <span className="text-xs font-normal text-muted-foreground">{sub}</span>}
        </span>
        <span className="flex flex-col">
          {active ? (
            activeDir === "asc" ? (
              <ArrowUp className="size-3" aria-hidden />
            ) : (
              <ArrowDown className="size-3" aria-hidden />
            )
          ) : (
            <span aria-hidden className="size-3 opacity-0 transition-opacity group-hover:opacity-50" />
          )}
        </span>
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {lang === "es" ? (
            <>
              Haz clic en un encabezado para ordenar. Los mains y secundarios se calculan automáticamente a partir de tu
              historial real de partidas — un secundario necesita 10%+ de tus partidas para contar. La mayoría de los
              personajes echo (Dark Pit, Daisy, Dark Samus, Richter) se cuentan junto con su personaje base —
              Marth/Lucina, Roy/Chrom y Ryu/Ken se mantienen aparte. Juegos y tasa de victorias cubren juegos rankeados
              de la temporada seleccionada.
            </>
          ) : (
            <>
              Click a column header to sort. Mains and secondaries are computed automatically from your actual match
              history — a secondary needs 10%+ of your games to count. Most echo fighters (Dark Pit, Daisy, Dark Samus,
              Richter) are counted together with their base fighter — Marth/Lucina, Roy/Chrom, and Ryu/Ken are kept
              separate. Games and win rate cover ranked games from the selected season.
            </>
          )}
        </p>
        {season && (
          <Badge variant="outline" className="shrink-0">
            {season.name}
          </Badge>
        )}
      </div>

      <Card className="overflow-hidden py-0">
        {/* Scrolls horizontally instead of clipping columns on narrow viewports */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pl-4 pr-2 text-left">
                  <HeaderLink label={lang === "es" ? "Personaje" : "Character"} col="alpha" />
                </th>
                <th className="py-2 px-2 text-right">
                  <HeaderLink
                    label={lang === "es" ? "Jugadores" : "Players"}
                    sub={lang === "es" ? "mains + secundarios" : "Mains + Secondaries"}
                    col="players"
                    className="justify-end"
                  />
                </th>
                <th className="py-2 px-2 text-right tabular-nums">
                  <HeaderLink label="Mains" col="mains" className="justify-end" />
                </th>
                <th className="py-2 px-2 text-right tabular-nums">
                  <HeaderLink label={lang === "es" ? "Juegos" : "Games"} col="games" className="justify-end" />
                </th>
                <th className="py-2 px-2 text-right tabular-nums">
                  <HeaderLink
                    label={lang === "es" ? "Tasa de victorias" : "Win rate"}
                    col="winrate"
                    className="justify-end"
                  />
                </th>
                <th className="py-2 pr-4 pl-2 text-right tabular-nums">
                  <HeaderLink
                    label={lang === "es" ? "Clasificación media" : "Avg Rating"}
                    col="rating"
                    className="justify-end"
                  />
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
                    {row.avgRating === null ? <span className="text-muted-foreground">—</span> : row.avgRating}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_CHARACTERS} />
    </div>
  );
}
