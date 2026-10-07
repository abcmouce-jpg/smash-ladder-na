import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CharacterSelect } from "@/components/character-select";
import { OptionSelect } from "@/components/option-select";
import { SMASH_CHARACTERS } from "@/lib/characters";
import { getActiveSeason, listPastSeasons } from "@/lib/seasons";
import { getHiddenRatingMatchIds, getPlayerMatchCount, getPlayerMatchHistory } from "@/lib/players";
import type { Lang } from "@/lib/i18n";
import { MatchHistoryList } from "./match-history-list";

// Rows per page on the full Match History tab — larger than the overview's
// recent strip, since this tab exists precisely to browse further back.
const MATCH_HISTORY_PAGE_SIZE = 20;

// The full, filterable history: every confirmed match this player has played
// (practice included, labeled), paged and narrowed by season and by the
// fighters each side used. Server-rendered entirely off the URL's searchParams
// so every filter/page combination stays deep-linkable, matching the tab strip
// and the leaderboard's filter form.
export async function ProfileMatchHistorySection({
  id,
  playerUsername,
  page,
  seasonParam,
  playedParam,
  againstParam,
  isOwnProfile,
  isModerator,
  lang,
}: {
  id: string;
  playerUsername: string;
  page: number;
  seasonParam: string | null | undefined;
  playedParam: string | null | undefined;
  againstParam: string | null | undefined;
  isOwnProfile: boolean;
  isModerator: boolean;
  lang: Lang;
}) {
  const [activeSeason, pastSeasons, { changeIds }] = await Promise.all([
    getActiveSeason(),
    listPastSeasons(),
    getHiddenRatingMatchIds(id),
  ]);
  const seasonOptions = [
    ...(activeSeason ? [{ value: activeSeason.id, label: activeSeason.name }] : []),
    ...pastSeasons.map((s) => ({ value: s.id, label: s.name })),
  ];
  // Validated against the real option sets before querying — an unknown id or
  // fighter in a hand-edited URL filters to nothing the UI can't explain, so
  // it's treated as "no filter" instead.
  const seasonId = seasonParam && seasonOptions.some((o) => o.value === seasonParam) ? seasonParam : null;
  const playedCharacter =
    playedParam && (SMASH_CHARACTERS as readonly string[]).includes(playedParam) ? playedParam : null;
  const againstCharacter =
    againstParam && (SMASH_CHARACTERS as readonly string[]).includes(againstParam) ? againstParam : null;
  const filters = { seasonId, playedCharacter, againstCharacter };
  const isFiltered = Boolean(seasonId || playedCharacter || againstCharacter);

  const [history, totalMatchCount] = await Promise.all([
    getPlayerMatchHistory(id, {
      limit: MATCH_HISTORY_PAGE_SIZE,
      skip: (page - 1) * MATCH_HISTORY_PAGE_SIZE,
      ...filters,
    }),
    getPlayerMatchCount(id, filters),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalMatchCount / MATCH_HISTORY_PAGE_SIZE));
  const hiddenChangeIds = new Set(changeIds);

  // The correction / admin-override controls only ever attach to the player's
  // true most recent real match, so that anchor is resolved from an unfiltered
  // recent fetch — a filter or a later page must never move it.
  const recentForAnchor = await getPlayerMatchHistory(id, { limit: 20 });
  const mostRecentRealMatchId = recentForAnchor.find((m) => !m.isPracticing)?.id ?? null;

  return (
    <div>
      <form method="get" className="flex flex-wrap items-end gap-2">
        {/* Keeps this tab selected when the GET form replaces the URL's query —
            a plain form submit drops any params it doesn't re-declare. */}
        <input type="hidden" name="tab" value="matches" />
        <label className="flex w-full flex-col gap-1 text-sm md:w-auto">
          {lang === "es" ? "Temporada" : "Season"}
          {/* key forces remount so defaultValue syncs when searchParams change */}
          <OptionSelect
            key={seasonId ?? ""}
            name="season"
            defaultValue={seasonId ?? ""}
            placeholder={lang === "es" ? "Todas las temporadas" : "All seasons"}
            clearLabel={lang === "es" ? "Todas las temporadas" : "All seasons"}
            className="w-full md:w-44"
            searchable
            searchPlaceholder={lang === "es" ? "Buscar temporadas…" : "Search seasons…"}
            options={seasonOptions}
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-sm md:w-auto">
          {lang === "es" ? "Personaje usado" : "Character played"}
          <CharacterSelect
            key={playedCharacter ?? ""}
            name="character"
            defaultValue={playedCharacter ?? ""}
            placeholder={lang === "es" ? "Todos los personajes" : "All characters"}
            clearLabel={lang === "es" ? "Todos los personajes" : "All characters"}
            className="w-full md:w-44"
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-sm md:w-auto">
          {lang === "es" ? "Contra personaje" : "Character against"}
          <CharacterSelect
            key={againstCharacter ?? ""}
            name="against"
            defaultValue={againstCharacter ?? ""}
            placeholder={lang === "es" ? "Todos los personajes" : "All characters"}
            clearLabel={lang === "es" ? "Todos los personajes" : "All characters"}
            className="w-full md:w-44"
          />
        </label>
        <Button type="submit" size="sm" variant="outline" className="h-8 w-full md:w-auto">
          {lang === "es" ? "Filtrar" : "Filter"}
        </Button>
        {isFiltered && (
          <Link
            href="?tab=matches"
            prefetch={false}
            className="flex h-8 items-center text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            {lang === "es" ? "Limpiar" : "Clear"}
          </Link>
        )}
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {lang === "es" ? "Historial de partidas" : "Match history"}
          </h2>
          <Badge variant="outline">
            {lang === "es"
              ? `${totalMatchCount} ${totalMatchCount === 1 ? "partida" : "partidas"}`
              : `${totalMatchCount} ${totalMatchCount === 1 ? "match" : "matches"}`}
          </Badge>
        </div>
        {totalPages > 1 && (
          <MatchHistoryPaginationControls
            playerId={id}
            page={page}
            totalPages={totalPages}
            filters={filters}
            lang={lang}
          />
        )}
      </div>

      {history.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {lang === "es"
            ? isFiltered
              ? "Ninguna partida coincide con estos filtros."
              : "Aún no hay partidas confirmadas."
            : isFiltered
              ? "No matches match these filters."
              : "No confirmed matches yet."}
        </p>
      ) : (
        <MatchHistoryList
          playerId={id}
          playerUsername={playerUsername}
          matches={history}
          mostRecentRealMatchId={mostRecentRealMatchId}
          hiddenChangeIds={hiddenChangeIds}
          isOwnProfile={isOwnProfile}
          isModerator={isModerator}
          lang={lang}
        />
      )}
    </div>
  );
}

// The active filters, carried through every pager link so paging never quietly
// widens the results back out to the full history.
type MatchHistoryFilterParams = {
  seasonId: string | null;
  playedCharacter: string | null;
  againstCharacter: string | null;
};

function matchHistoryHref(playerId: string, page: number, filters: MatchHistoryFilterParams) {
  const params = new URLSearchParams({ tab: "matches", page: String(page) });
  if (filters.seasonId) params.set("season", filters.seasonId);
  if (filters.playedCharacter) params.set("character", filters.playedCharacter);
  if (filters.againstCharacter) params.set("against", filters.againstCharacter);
  return `/players/${playerId}?${params.toString()}`;
}

function MatchHistoryPaginationControls({
  playerId,
  page,
  totalPages,
  filters,
  lang,
}: {
  playerId: string;
  page: number;
  totalPages: number;
  filters: MatchHistoryFilterParams;
  lang: Lang;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <MatchHistoryPageLink playerId={playerId} page={page - 1} filters={filters} disabled={page <= 1}>
        {lang === "es" ? "← Anterior" : "← Previous"}
      </MatchHistoryPageLink>
      <span className="text-muted-foreground tabular-nums">
        {lang === "es" ? `Página ${page} de ${totalPages}` : `Page ${page} of ${totalPages}`}
      </span>
      <MatchHistoryPageLink playerId={playerId} page={page + 1} filters={filters} disabled={page >= totalPages}>
        {lang === "es" ? "Siguiente →" : "Next →"}
      </MatchHistoryPageLink>
    </div>
  );
}

function MatchHistoryPageLink({
  playerId,
  page,
  filters,
  disabled,
  children,
}: {
  playerId: string;
  page: number;
  filters: MatchHistoryFilterParams;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-muted-foreground/40">{children}</span>;
  }
  return (
    <Link href={matchHistoryHref(playerId, page, filters)} prefetch={false} className="hover:underline">
      {children}
    </Link>
  );
}
