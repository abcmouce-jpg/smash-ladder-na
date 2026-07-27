import Link from "next/link";
import { Trophy } from "lucide-react";
import { SMASH_CHARACTERS } from "@/lib/characters";
import { MATCH_REGIONS } from "@/lib/regions";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { getLeaderboardPlayers } from "@/lib/leaderboard";
import { ensureActiveSeason, PRE_SEASON_DURATION_MONTHS, PRE_SEASON_EXPECTED_END_AT } from "@/lib/seasons";
import { SEASON_PRIZE_POOL_USD, prizeForPlace } from "@/lib/prizes";
import { CharacterIcon } from "@/components/character-icon";
import { CharacterFilterSelect } from "@/components/character-filter-select";
import { RankBadge } from "@/components/rank-badge";
import { AdSlot } from "@/components/ad-slot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const MEDALS = ["🥇", "🥈", "🥉"];
const PAGE_SIZE = 50;

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ character?: string; page?: string; q?: string; region?: string }>;
}) {
  const { character, page: pageParam, q, region } = await searchParams;
  const isValidCharacter = character && (SMASH_CHARACTERS as readonly string[]).includes(character);
  const isValidRegion = region && (MATCH_REGIONS as readonly string[]).includes(region);
  const query = (q ?? "").trim().slice(0, 32);
  const isFiltered = Boolean(isValidCharacter) || query.length > 0 || Boolean(isValidRegion);

  const requestedPage = Number(pageParam);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const season = await ensureActiveSeason();
  const { players, totalCount } = await getLeaderboardPlayers(
    { character: isValidCharacter ? character : null, query, region: isValidRegion ? region : null },
    { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE },
  );
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rankOffset = (page - 1) * PAGE_SIZE;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <Badge variant="outline">{season.name}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Ranked players with {LEADERBOARD_MIN_GAMES}+ games played
        {isValidCharacter ? ` who main ${character}` : ""}
        {isValidRegion ? ` in ${region}` : ""}
        {query ? ` matching "${query}"` : ""}.
      </p>

      {!isFiltered && (
        <Card className="mt-4 border-primary/20 bg-primary/[0.04] py-3">
          <p className="px-4 text-sm">
            🏆 <span className="font-medium">${SEASON_PRIZE_POOL_USD} USD season prize pool</span> —
            split among the top 5 finishers when {season.name} ends.
            {season.name === "Preseason" && (
              <>
                {" "}
                This is a fixed {PRE_SEASON_DURATION_MONTHS}-month preseason, expected to end around{" "}
                {PRE_SEASON_EXPECTED_END_AT.toLocaleDateString("en-US", {
                  timeZone: "America/New_York",
                  dateStyle: "long",
                })}
                .
              </>
            )}
          </p>
        </Card>
      )}

      <form method="get" className="mt-4 flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Player name
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search by username"
            maxLength={32}
            className="h-8 w-48 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
          />
        </label>
        <CharacterFilterSelect
          defaultValue={isValidCharacter ? character : ""}
        />
        <label className="flex flex-col gap-1 text-sm">
          Region
          <select
            name="region"
            defaultValue={isValidRegion ? region : ""}
            className="h-8 w-48 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
          >
            <option value="" className="bg-background text-foreground">
              All regions
            </option>
            {MATCH_REGIONS.map((r) => (
              <option key={r} value={r} className="bg-background text-foreground">
                {r}
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
              <th className="py-2 font-medium text-right tabular-nums">Games</th>
              {!isFiltered && (
                <th className="py-2 pr-4 font-medium text-right tabular-nums">Prize</th>
              )}
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => {
              const rank = rankOffset + index;
              return (
                <tr
                  key={player.id}
                  className={`border-b border-border/60 last:border-0 ${
                    rank < 3 ? "bg-primary/[0.04]" : ""
                  }`}
                >
                  <td className="py-2 pl-4 tabular-nums text-muted-foreground">
                    {MEDALS[rank] ?? rank + 1}
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/players/${player.id}`}
                      className="flex items-center gap-2 hover:underline"
                    >
                      {player.mainCharacter && <CharacterIcon name={player.mainCharacter} size={20} />}
                      {player.secondaryCharacters.map((c) => (
                        <CharacterIcon key={c} name={c} size={16} className="opacity-60" />
                      ))}
                      {player.username}
                    </Link>
                  </td>
                  <td className="py-2">
                    <RankBadge rating={player.rating} gamesPlayed={player.gamesPlayed} />
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">{player.rating}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {player.gamesPlayed}
                  </td>
                  {!isFiltered && (
                    <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                      {prizeForPlace(rank + 1) !== null ? `$${prizeForPlace(rank + 1)} USD` : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {players.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No ranked players yet.</p>
        )}
      </Card>

      {totalCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Badge variant="outline">
            {totalCount} ranked player{totalCount === 1 ? "" : "s"}
          </Badge>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <PageLink
                page={page - 1}
                character={isValidCharacter ? character : undefined}
                query={query || undefined}
                region={isValidRegion ? region : undefined}
                disabled={page <= 1}
              >
                ← Previous
              </PageLink>
              <span className="text-muted-foreground tabular-nums">
                Page {page} of {totalPages}
              </span>
              <PageLink
                page={page + 1}
                character={isValidCharacter ? character : undefined}
                query={query || undefined}
                region={isValidRegion ? region : undefined}
                disabled={page >= totalPages}
              >
                Next →
              </PageLink>
            </div>
          )}
        </div>
      )}

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_LEADERBOARD} />
    </main>
  );
}

function PageLink({
  page,
  character,
  query,
  region,
  disabled,
  children,
}: {
  page: number;
  character?: string;
  query?: string;
  region?: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-muted-foreground/40">{children}</span>;
  }
  const params = new URLSearchParams();
  if (character) params.set("character", character);
  if (query) params.set("q", query);
  if (region) params.set("region", region);
  params.set("page", String(page));
  return (
    <Link href={`/leaderboard?${params.toString()}`} className="hover:underline">
      {children}
    </Link>
  );
}
