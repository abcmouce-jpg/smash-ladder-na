import Link from "next/link";
import { CalendarClock, Trophy } from "lucide-react";
import { auth } from "@/auth";
import { SMASH_CHARACTERS, echoGroupLabel, type SmashCharacter } from "@/lib/characters";
import {
  MATCH_REGIONS,
  MATCH_REGION_GROUPS,
  MATCH_COUNTRIES,
  expandCountryForSearch,
  type MatchCountry,
} from "@/lib/regions";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { getLeaderboardPlayers } from "@/lib/leaderboard";
import { getCharacterUsage } from "@/lib/players";
import {
  ensureActiveSeason,
  getSeasonEndsAt,
  PRE_SEASON_DURATION_MONTHS,
  PRE_SEASON_EXPECTED_END_AT,
} from "@/lib/seasons";
import { SEASON_PRIZE_POOL_USD, PRIZE_AMOUNTS_USD, approxMxn, prizeForPlace } from "@/lib/prizes";
import { CharacterUsageIcons } from "@/components/character-usage-icons";
import { CharacterFilterSelect } from "@/components/character-filter-select";
import { InfoPopup } from "@/components/info-popup";
import { PageHeading } from "@/components/page-heading";
import { OptionSelect, type OptionSelectOption } from "@/components/option-select";
import { RankBadge } from "@/components/rank-badge";
import { SeasonCountdown } from "@/components/season-countdown";
import { AdSlot } from "@/components/ad-slot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLang, type Lang } from "@/lib/i18n";
import { formatRating } from "@/lib/rating-format";
import { tr, trNode } from "@/lib/lang";
import { USES_REGIONS, DISPLAY_TIME_ZONE, HAS_PRIZE_POOL } from "@/lib/site";

const MEDALS = ["🥇", "🥈", "🥉"];
const PAGE_SIZE = 50;

const REGION_OPTIONS: OptionSelectOption[] = MATCH_REGION_GROUPS.flatMap((group) =>
  group.regions.map((r) => ({ value: r, label: r, group: group.label })),
);

const COUNTRY_OPTIONS: OptionSelectOption[] = MATCH_COUNTRIES.map((c) => ({
  value: c,
  label: c,
}));

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    character?: string;
    page?: string;
    q?: string;
    region?: string;
    country?: string;
  }>;
}) {
  const { character, page: pageParam, q, region, country } = await searchParams;
  const isValidCharacter = character && (SMASH_CHARACTERS as readonly string[]).includes(character);
  const isValidCountry = USES_REGIONS && country && (MATCH_COUNTRIES as readonly string[]).includes(country);
  const effectiveCountry = isValidCountry ? (country as MatchCountry) : null;
  // A region only stays selected if it actually belongs to the chosen
  // country — otherwise a stale region from before the country was changed
  // (or narrowed) would keep silently filtering by itself even though the
  // Region dropdown no longer shows it as an option, the same "invisible
  // leftover selection" trap the match-distance presets bug hit on 2026-08-05.
  const countryRegions = effectiveCountry ? new Set(expandCountryForSearch(effectiveCountry)) : null;
  const isValidRegion =
    USES_REGIONS &&
    region &&
    (MATCH_REGIONS as readonly string[]).includes(region) &&
    (!countryRegions || countryRegions.has(region));
  const query = (q ?? "").trim().slice(0, 32);
  const isFiltered = Boolean(isValidCharacter) || query.length > 0 || Boolean(isValidRegion) || Boolean(isValidCountry);

  const requestedPage = Number(pageParam);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  // Narrowed to the selected country's regions once one is picked, so the
  // dropdown can't offer a region that'd just get silently ignored.
  const regionOptions = countryRegions ? REGION_OPTIONS.filter((opt) => countryRegions.has(opt.value)) : REGION_OPTIONS;

  const [session, season, { players, totalCount }, lang] = await Promise.all([
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
    getLang(),
  ]);

  // Live usage per displayed row rather than the cached mainCharacter/
  // secondaryCharacters columns — one query per row, trivial at this
  // player-count, and keeps the icon stack in sync with CharacterUsageIcons'
  // main/secondary/overflow slicing without a second source of truth.
  const usageByPlayerId = new Map(
    await Promise.all(players.map(async (p) => [p.id, await getCharacterUsage(p.id)] as const)),
  );
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rankOffset = (page - 1) * PAGE_SIZE;
  const viewerId = session?.user?.id ?? null;
  // Null for a season with no scheduledEndAt (manual-only) — see getSeasonEndsAt.
  const seasonEndsAt = getSeasonEndsAt(season);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <PageHeading
        icon={Trophy}
        title={tr(lang, {
          en: "Leaderboard",
          es: "Tabla de clasificación",
          ja: "ランキング",
        })}
        description={
          <span>
            {(() => {
              const characterClause = isValidCharacter ? echoGroupLabel(character as SmashCharacter) : null;
              const placeClause = isValidRegion ? region : isValidCountry ? country : null;
              return tr(lang, {
                en:
                  `Ranked players with ${LEADERBOARD_MIN_GAMES}+ sets played` +
                  (characterClause ? ` who play ${characterClause} as a main or secondary` : "") +
                  (placeClause ? ` in ${placeClause}` : "") +
                  (query ? ` matching "${query}"` : "") +
                  ".",
                es:
                  `Jugadores rankeados con ${LEADERBOARD_MIN_GAMES}+ partidas jugadas` +
                  (characterClause ? ` que usan a ${characterClause} como main o secundario` : "") +
                  (placeClause ? ` en ${placeClause}` : "") +
                  (query ? ` que coinciden con "${query}"` : "") +
                  ".",
                ja:
                  (placeClause ? `${placeClause}の` : "") +
                  (characterClause ? `${characterClause}をメインまたはサブで使う` : "") +
                  (query ? `「${query}」に一致する` : "") +
                  `${LEADERBOARD_MIN_GAMES}セット以上プレイしたランク対象プレイヤー。`,
              });
            })()}
          </span>
        }
        action={<InfoPopup lang={lang} />}
      />

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
            <h2 className="text-base font-semibold tracking-tight">{season.name}</h2>
          </div>
          {seasonEndsAt && (
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-muted-foreground">
                {tr(lang, { en: "Ends in", es: "Termina en", ja: "残り" })}
              </span>
              <SeasonCountdown endsAt={seasonEndsAt.toISOString()} lang={lang} />
            </div>
          )}
        </div>
      </Card>

      {HAS_PRIZE_POOL && !isFiltered && (
        <Card className="mt-6 border-primary/20 bg-primary/[0.04]">
          <div className="px-4 py-3">
            <p className="text-sm">
              {trNode(lang, {
                en: (
                  <>
                    🏆 <span className="font-medium">${SEASON_PRIZE_POOL_USD} USD season prize pool</span> — split among
                    the top 3 finishers when {season.name} ends.
                    {season.name === "Preseason" && (
                      <>
                        {" "}
                        This is a fixed {PRE_SEASON_DURATION_MONTHS}-month preseason, expected to end around{" "}
                        {PRE_SEASON_EXPECTED_END_AT.toLocaleDateString("en-US", {
                          timeZone: DISPLAY_TIME_ZONE,
                          dateStyle: "long",
                        })}
                        .
                      </>
                    )}
                  </>
                ),
                es: (
                  <>
                    🏆{" "}
                    <span className="font-medium">
                      Bolsa de premios de ${SEASON_PRIZE_POOL_USD} USD (≈ $
                      {approxMxn(SEASON_PRIZE_POOL_USD).toLocaleString("es-MX")} MXN)
                    </span>{" "}
                    — repartida entre los 3 primeros cuando termine {season.name}.
                    {season.name === "Preseason" && (
                      <>
                        {" "}
                        Esta preseason es fija de {PRE_SEASON_DURATION_MONTHS} meses, con fin estimado alrededor del{" "}
                        {PRE_SEASON_EXPECTED_END_AT.toLocaleDateString("es-MX", {
                          timeZone: DISPLAY_TIME_ZONE,
                          dateStyle: "long",
                        })}
                        .
                      </>
                    )}
                  </>
                ),
                ja: (
                  <>
                    🏆 <span className="font-medium">シーズン賞金 ${SEASON_PRIZE_POOL_USD} USD</span> — {season.name}
                    終了時に上位3名で分配されます。
                    {season.name === "Preseason" && (
                      <>
                        {" "}
                        このプレシーズンは{PRE_SEASON_DURATION_MONTHS}
                        ヶ月の固定期間で、
                        {PRE_SEASON_EXPECTED_END_AT.toLocaleDateString("ja-JP", {
                          timeZone: DISPLAY_TIME_ZONE,
                          dateStyle: "long",
                        })}
                        頃の終了を見込んでいます。
                      </>
                    )}
                  </>
                ),
              })}
            </p>

            {/* Prize split infographic — only meaningful on the global
                leaderboard, which is why it renders alongside the banner that
                already hides when a filter is applied. */}
            <div className="mt-4">
              <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                {tr(lang, {
                  en: "Prize split",
                  es: "Distribución del premio",
                  ja: "賞金の分配",
                })}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-3">
                {PRIZE_AMOUNTS_USD.map((_, i) => {
                  const place = i + 1;
                  const usd = prizeForPlace(place) ?? 0;
                  // English ordinals are irregular for the first three;
                  // Spanish and Japanese both take one suffix throughout.
                  const englishOrdinal = place === 1 ? "1st" : place === 2 ? "2nd" : place === 3 ? "3rd" : `${place}th`;
                  const rankLabel = tr(lang, {
                    en: englishOrdinal,
                    es: `${place}.º`,
                    ja: `${place}位`,
                  });
                  return (
                    <div key={place} className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">{rankLabel}</span>
                      <span className="text-sm font-medium tabular-nums">${usd} USD</span>
                      {lang === "es" && usd > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          ≈ ${approxMxn(usd).toLocaleString("es-MX")} MXN
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      <form method="get" className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex w-full flex-col gap-1 text-sm md:w-auto">
          {tr(lang, {
            en: "Player name",
            es: "Nombre de jugador",
            ja: "プレイヤー名",
          })}
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder={tr(lang, {
              en: "Search by username",
              es: "Buscar por nombre de usuario",
              ja: "ユーザー名で検索",
            })}
            maxLength={32}
            className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring md:w-32"
          />
        </label>
        <CharacterFilterSelect
          defaultValue={isValidCharacter ? character : ""}
          lang={lang}
          className="w-full md:w-40"
        />
        {USES_REGIONS && (
          <>
            <label className="flex w-full flex-col gap-1 text-sm md:w-auto">
              {tr(lang, { en: "Country", es: "País", ja: "国" })}
              <OptionSelect
                key={isValidCountry ? country : ""}
                name="country"
                defaultValue={isValidCountry ? country : ""}
                placeholder={tr(lang, {
                  en: "All countries",
                  es: "Todos los países",
                  ja: "すべての国",
                })}
                clearLabel={tr(lang, {
                  en: "All countries",
                  es: "Todos los países",
                  ja: "すべての国",
                })}
                className="w-full md:w-32"
                options={COUNTRY_OPTIONS}
                autoSubmit
              />
            </label>
            <label className="flex w-full flex-col gap-1 text-sm md:w-auto">
              {tr(lang, { en: "Region", es: "Región", ja: "地域" })}
              {/* Narrowed to the chosen country's regions once one is picked
                (see regionOptions above) — pick a country, and the list here
                only offers regions that actually belong to it. */}
              <OptionSelect
                key={isValidRegion ? region : (effectiveCountry ?? "")}
                name="region"
                defaultValue={isValidRegion ? region : ""}
                placeholder={tr(lang, {
                  en: "All regions",
                  es: "Todas las regiones",
                  ja: "すべての地域",
                })}
                clearLabel={tr(lang, {
                  en: "All regions",
                  es: "Todas las regiones",
                  ja: "すべての地域",
                })}
                className="w-full md:w-40"
                searchable
                searchPlaceholder={tr(lang, {
                  en: "Search regions…",
                  es: "Buscar regiones…",
                  ja: "地域を検索…",
                })}
                options={regionOptions}
                autoSubmit
              />
            </label>
          </>
        )}
        <Button type="submit" size="sm" variant="outline" className="h-8 w-full md:w-auto">
          {tr(lang, { en: "Filter", es: "Filtrar", ja: "絞り込む" })}
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
          lang={lang}
        />
      )}

      <Card className="mt-4 overflow-hidden py-0">
        {/* Scrolls horizontally instead of clipping columns on narrow viewports */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pl-4 font-medium">#</th>
                <th className="py-2 font-medium">{tr(lang, { en: "Player", es: "Jugador", ja: "プレイヤー" })}</th>
                <th className="py-2 font-medium">{tr(lang, { en: "Tier", es: "Rango", ja: "ランク帯" })}</th>
                <th className="py-2 font-medium text-right tabular-nums">
                  {tr(lang, {
                    en: "Rating",
                    es: "Clasificación",
                    ja: "レート",
                  })}
                </th>
                <th className="py-2 pr-4 font-medium text-right tabular-nums">
                  {tr(lang, { en: "Sets", es: "Partidas", ja: "セット" })}
                </th>
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
                // Rounded ends mean the shown gap always matches the two shown
                // ratings, and two players at the same whole number read as 0.
                const gapToNext =
                  isViewer && index > 0 ? formatRating(players[index - 1].rating) - formatRating(player.rating) : null;
                return (
                  <tr
                    key={player.id}
                    className={`border-b border-border/60 last:border-0 ${
                      isViewer ? "bg-primary/10" : rank < 3 ? "bg-primary/[0.04]" : ""
                    }`}
                  >
                    <td className="py-2 pl-4 tabular-nums text-muted-foreground">{MEDALS[rank] ?? rank + 1}</td>
                    <td className="py-2">
                      <Link href={`/players/${player.id}`} className="flex items-center gap-2 hover:underline">
                        {player.username}
                        <CharacterUsageIcons usage={usageByPlayerId.get(player.id) ?? []} />
                        {gapToNext !== null && gapToNext > 0 && (
                          <span className="text-xs font-normal text-muted-foreground">
                            {tr(lang, {
                              en: `${gapToNext} to pass ${players[index - 1].username}`,
                              es: `${gapToNext} para superar a ${players[index - 1].username}`,
                              ja: `${players[index - 1].username}を抜くまであと${gapToNext}`,
                            })}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="py-2">
                      <RankBadge rating={player.rating} gamesPlayed={player.gamesPlayed} lang={lang} />
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums">{formatRating(player.rating)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{player.gamesPlayed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {players.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            {tr(lang, {
              en: "No ranked players yet.",
              es: "Aún no hay jugadores rankeados.",
              ja: "まだランク対象のプレイヤーがいません。",
            })}
          </p>
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
  lang,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  character?: string;
  query?: string;
  region?: string;
  country?: string;
  lang: Lang;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <Badge variant="outline">
        {tr(lang, {
          en: `${totalCount} ranked player${totalCount === 1 ? "" : "s"}`,
          es: `${totalCount} ${totalCount === 1 ? "jugador rankeado" : "jugadores rankeados"}`,
          ja: `ランク対象プレイヤー${totalCount}人`,
        })}
      </Badge>
      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <PageLink
              page={page - 1}
              character={character}
              query={query}
              region={region}
              country={country}
              disabled={page <= 1}
            >
              {tr(lang, { en: "← Previous", es: "← Anterior", ja: "← 前へ" })}
            </PageLink>
            <span className="text-muted-foreground tabular-nums">
              {tr(lang, {
                en: `Page ${page} of ${totalPages}`,
                es: `Página ${page} de ${totalPages}`,
                ja: `${totalPages}ページ中${page}ページ目`,
              })}
            </span>
            <PageLink
              page={page + 1}
              character={character}
              query={query}
              region={region}
              country={country}
              disabled={page >= totalPages}
            >
              {tr(lang, { en: "Next →", es: "Siguiente →", ja: "次へ →" })}
            </PageLink>
          </div>
          <form method="get" className="flex items-center gap-1.5">
            {character && <input type="hidden" name="character" value={character} />}
            {query && <input type="hidden" name="q" value={query} />}
            {region && <input type="hidden" name="region" value={region} />}
            {country && <input type="hidden" name="country" value={country} />}
            <label htmlFor="leaderboard-page-jump" className="sr-only">
              {tr(lang, {
                en: "Jump to page",
                es: "Ir a la página",
                ja: "ページ移動",
              })}
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
              {tr(lang, { en: "Go", es: "Ir", ja: "移動" })}
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
