import Link from "next/link";
import { Trophy } from "lucide-react";
import { auth } from "@/auth";
import { SMASH_CHARACTERS, echoGroupLabel, type SmashCharacter } from "@/lib/characters";
import { MATCH_REGIONS, MATCH_REGION_GROUPS, MATCH_COUNTRIES, expandCountryForSearch, type MatchCountry } from "@/lib/regions";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { getLeaderboardPlayers } from "@/lib/leaderboard";
import { ensureActiveSeason, PRE_SEASON_DURATION_MONTHS, PRE_SEASON_EXPECTED_END_AT } from "@/lib/seasons";
import { SEASON_PRIZE_POOL_USD, prizeForPlace } from "@/lib/prizes";
import { CharacterIcon } from "@/components/character-icon";
import { CharacterFilterSelect } from "@/components/character-filter-select";
import { OptionSelect, type OptionSelectOption } from "@/components/option-select";
import { RankBadge } from "@/components/rank-badge";
import { AdSlot } from "@/components/ad-slot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const MEDALS = ["🥇", "🥈", "🥉"];
const PAGE_SIZE = 50;

const REGION_OPTIONS: OptionSelectOption[] = MATCH_REGION_GROUPS.flatMap((group) =>
  group.regions.map((r) => ({ value: r, label: r, group: group.label })),
);

const COUNTRY_OPTIONS: OptionSelectOption[] = MATCH_COUNTRIES.map((c) => ({ value: c, label: c }));

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ character?: string; page?: string; q?: string; region?: string; country?: string }>;
}) {
  const { character, page: pageParam, q, region, country } = await searchParams;
  const isValidCharacter = character && (SMASH_CHARACTERS as readonly string[]).includes(character);
  const isValidCountry = country && (MATCH_COUNTRIES as readonly string[]).includes(country);
  const effectiveCountry = isValidCountry ? (country as MatchCountry) : null;
  // A region only stays selected if it actually belongs to the chosen
  // country — otherwise a stale region from before the country was changed
  // (or narrowed) would keep silently filtering by itself even though the
  // Region dropdown no longer shows it as an option, the same "invisible
  // leftover selection" trap the match-distance presets bug hit on 2026-08-05.
  const countryRegions = effectiveCountry ? new Set(expandCountryForSearch(effectiveCountry)) : null;
  const isValidRegion =
    region && (MATCH_REGIONS as readonly string[]).includes(region) && (!countryRegions || countryRegions.has(region));
  const query = (q ?? "").trim().slice(0, 32);
  const isFiltered =
    Boolean(isValidCharacter) || query.length > 0 || Boolean(isValidRegion) || Boolean(isValidCountry);

  const requestedPage = Number(pageParam);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  // Narrowed to the selected country's regions once one is picked, so the
  // dropdown can't offer a region that'd just get silently ignored.
  const regionOptions = countryRegions
    ? REGION_OPTIONS.filter((opt) => countryRegions.has(opt.value))
    : REGION_OPTIONS;

  const [session, season, { players, totalCount }] = await Promise.all([
    auth(),
    ensureActiveSeason(),
    getLeaderboardPlayers(
      {
        character: isValidCharacter ? character : null,
        query,
        region: isValidRegion ? region : null,
        country: effectiveCountry,
      },
      { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE },
    ),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rankOffset = (page - 1) * PAGE_SIZE;
  const viewerId = session?.user?.id ?? null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <Badge variant="outline">{season.name}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Ranked players with {LEADERBOARD_MIN_GAMES}+ sets played
        {isValidCharacter
          ? ` who play ${echoGroupLabel(character as SmashCharacter)} as a main or secondary`
          : ""}
        {isValidRegion ? ` in ${region}` : ""}
        {!isValidRegion && isValidCountry ? ` in ${country}` : ""}
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
          Country
          <OptionSelect
            key={isValidCountry ? country : ""}
            name="country"
            defaultValue={isValidCountry ? country : ""}
            placeholder="All countries"
            clearLabel="All countries"
            className="w-40"
            options={COUNTRY_OPTIONS}
            autoSubmit
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Region
          {/* Narrowed to the chosen country's regions once one is picked
              (see regionOptions above) — pick a country, hit Filter, and
              the list here only offers regions that actually belong to it. */}
          <OptionSelect
            key={isValidRegion ? region : effectiveCountry ?? ""}
            name="region"
            defaultValue={isValidRegion ? region : ""}
            placeholder="All regions"
            clearLabel="All regions"
            className="w-48"
            searchable
            searchPlaceholder="Search regions…"
            options={regionOptions}
          />
        </label>
        <Button type="submit" size="sm" variant="outline" className="h-8">
          Filter
        </Button>
      </form>

      {totalCount > 0 && (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          character={isValidCharacter ? character : undefined}
          query={query || undefined}
          region={isValidRegion ? region : undefined}
          country={isValidCountry ? country : undefined}
        />
      )}

      <Card className="mt-4 overflow-hidden py-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pl-4 font-medium">#</th>
              <th className="py-2 font-medium">Player</th>
              <th className="py-2 font-medium">Tier</th>
              <th className="py-2 font-medium text-right tabular-nums">Rating</th>
              <th className={`py-2 font-medium text-right tabular-nums ${isFiltered ? "pr-4" : ""}`}>
                Sets
              </th>
              {!isFiltered && (
                <th className="py-2 pr-4 font-medium text-right tabular-nums">Prize</th>
              )}
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => {
              const rank = rankOffset + index;
              const isViewer = player.id === viewerId;
              // Only meaningful within the loaded page — the player directly
              // above in the same array, not a cross-page lookup (index 0
              // never gets a gap shown, even on page 2+, since we don't have
              // the previous page's last row loaded to compare against).
              const gapToNext = isViewer && index > 0 ? players[index - 1].rating - player.rating : null;
              return (
                <tr
                  key={player.id}
                  className={`border-b border-border/60 last:border-0 ${
                    isViewer ? "bg-primary/10" : rank < 3 ? "bg-primary/[0.04]" : ""
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
                      {gapToNext !== null && gapToNext > 0 && (
                        <span className="text-xs font-normal text-muted-foreground">
                          {gapToNext} to pass {players[index - 1].username}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="py-2">
                    <RankBadge rating={player.rating} gamesPlayed={player.gamesPlayed} />
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">{player.rating}</td>
                  <td
                    className={`py-2 text-right tabular-nums text-muted-foreground ${
                      isFiltered ? "pr-4" : ""
                    }`}
                  >
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

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_LEADERBOARD} />
    </main>
  );
}

function PaginationBar({
  page,
  totalPages,
  totalCount,
  character,
  query,
  region,
  country,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  character?: string;
  query?: string;
  region?: string;
  country?: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <Badge variant="outline">
        {totalCount} ranked player{totalCount === 1 ? "" : "s"}
      </Badge>
      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <PageLink page={page - 1} character={character} query={query} region={region} country={country} disabled={page <= 1}>
              ← Previous
            </PageLink>
            <span className="text-muted-foreground tabular-nums">
              Page {page} of {totalPages}
            </span>
            <PageLink
              page={page + 1}
              character={character}
              query={query}
              region={region}
              country={country}
              disabled={page >= totalPages}
            >
              Next →
            </PageLink>
          </div>
          <form method="get" className="flex items-center gap-1.5">
            {character && <input type="hidden" name="character" value={character} />}
            {query && <input type="hidden" name="q" value={query} />}
            {region && <input type="hidden" name="region" value={region} />}
            {country && <input type="hidden" name="country" value={country} />}
            <label htmlFor="leaderboard-page-jump" className="sr-only">
              Jump to page
            </label>
            <input
              id="leaderboard-page-jump"
              type="number"
              name="page"
              min={1}
              max={totalPages}
              defaultValue={page}
              className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none tabular-nums focus-visible:border-ring"
            />
            <Button type="submit" size="sm" variant="outline">
              Go
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

function PageLink({
  page,
  character,
  query,
  region,
  country,
  disabled,
  children,
}: {
  page: number;
  character?: string;
  query?: string;
  region?: string;
  country?: string;
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
  if (country) params.set("country", country);
  params.set("page", String(page));
  return (
    <Link href={`/leaderboard?${params.toString()}`} className="hover:underline">
      {children}
    </Link>
  );
}
