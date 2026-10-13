import Link from "next/link";
import { Award, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { RatingChart } from "@/components/rating-chart";
import { RatingHidden } from "@/components/rating-hidden";
import { CharacterUsageCard } from "@/components/character-usage-card";
import { MatchHistoryList } from "./match-history-list";
import {
  getCareerStats,
  getCurrentStreak,
  getHiddenRatingMatchIds,
  getPlayerMatchCount,
  getPlayerMatchHistory,
  getRatingChartPoints,
  getSeasonStats,
  getTopRivals,
  type CharacterUsage,
} from "@/lib/players";
import { getMatchHistoryAchievements } from "@/lib/match-achievements";
import { getLeaderboardRank } from "@/lib/leaderboard";
import { getPlayerSeasonAchievements } from "@/lib/seasons";
import {
  achievementComparator,
  computeAchievements,
  computeRatingMilestoneAchievements,
  isRatingVisible,
} from "@/lib/rank-tier";
import { formatRating } from "@/lib/rating-format";
import type { Lang } from "@/lib/i18n";

// The overview shows only the newest few matches so it stays a glance; the full
// — filterable, paginated — history lives on its own Match History tab.
const RECENT_MATCH_HISTORY_LIMIT = 10;

// Achievement labels/descriptions are generated in lib/rank-tier.ts and
// lib/match-achievements.ts (some with an interpolated rating threshold) —
// kept as a page-local id-keyed lookup rather than touching those files, same
// reasoning as the rank-tier description lookup in rank-tier-list.tsx. The
// rating-threshold achievements pull their number back out of the already-
// computed English description instead of re-importing minRatingFor.
const ACHIEVEMENTS_ES: Record<string, { label: string; description: string }> = {
  "first-win": { label: "Primera victoria", description: "Gana tu primera partida rankeada." },
  "ten-wins": { label: "10 victorias", description: "Gana 10 partidas rankeadas." },
  "fifty-wins": { label: "50 victorias", description: "Gana 50 partidas rankeadas." },
  veteran: { label: "3+ temporadas jugadas", description: "Juega en 3 o más temporadas del ladder." },
  competitor: { label: "Entraste a un torneo", description: "Inscríbete a un torneo a través del sitio." },
  "jack-of-trades": { label: "Todoterreno", description: "Gana una partida usando un personaje distinto cada juego." },
  "mirror-match": {
    label: "Espejo",
    description: "Gana una partida en la que tú y tu rival usaron exactamente el mismo personaje todo el tiempo.",
  },
  "risky-business": {
    label: "Jugada arriesgada",
    description:
      "Usa el mismo personaje en los juegos 1-4 de una partida, cambia a otro personaje en el juego 5, y gánalo.",
  },
  globetrotter: { label: "Trotamundos", description: "Gana al menos un juego en cada escenario legal." },
  "grudge-match": { label: "Revancha", description: "Vence a un rival que te venció la última vez que jugaron." },
  "beginners-luck": { label: "Suerte de principiante", description: "Gana la primera partida que juegues en un día." },
  "bounce-back": {
    label: "Recuperación",
    description: "Pierde la primera partida que juegues en un día, y gana la siguiente que juegues.",
  },
};

function achievementEs(a: { id: string; label: string; description: string }) {
  const es = ACHIEVEMENTS_ES[a.id];
  if (es) return es;
  // Reached Elite/Master/Grandmaster/Legend — pull the threshold back out of
  // the English description rather than re-deriving it.
  const rating = a.description.match(/\d+/)?.[0] ?? "";
  const tier = a.label.replace("Reached ", "");
  return { label: `Alcanzó ${tier}`, description: `Alcanza una clasificación de ${rating}.` };
}

// The default tab: rating chart, season/career summary cards, rivals,
// character usage, and the newest few matches. The full, filterable history
// lives on its own tab, reached from here via the "View more" link.
export async function ProfileOverviewSection({
  id,
  playerUsername,
  mainCharacter,
  usage,
  rating,
  gamesPlayed,
  practiceRating,
  practiceGamesPlayed,
  isOwnProfile,
  isModerator,
  lang,
}: {
  id: string;
  playerUsername: string;
  mainCharacter: string | null;
  usage: CharacterUsage[];
  rating: number;
  gamesPlayed: number;
  practiceRating: number;
  practiceGamesPlayed: number;
  isOwnProfile: boolean;
  isModerator: boolean;
  lang: Lang;
}) {
  // The opening sets of the ACTIVE season are the only thing hidden: a returner
  // keeps every earlier season's numbers, and those first sets stay hidden even
  // after they graduate. Computed once here and handed to each query below so
  // the chart, the peaks and the match-history trails all agree on the window.
  const { changeIds, valueIds } = await getHiddenRatingMatchIds(id);
  const hiddenChangeIds = new Set(changeIds);

  const [
    recentHistory,
    recentMatchHistory,
    totalMatchCount,
    chartPoints,
    careerStats,
    seasonStats,
    rivals,
    matchAchievements,
    seasonAchievements,
    streak,
    leaderboardRank,
  ] = await Promise.all([
    // The newest matches, independent of the recent strip below — the
    // win-rate/streak badges near the rating chart, and which match (if any)
    // the correction/admin-override forms attach to, both key off this list.
    getPlayerMatchHistory(id),
    getPlayerMatchHistory(id, { limit: RECENT_MATCH_HISTORY_LIMIT }),
    getPlayerMatchCount(id),
    getRatingChartPoints(id, 50, valueIds),
    getCareerStats(id, valueIds),
    getSeasonStats(id, valueIds),
    getTopRivals(id),
    getMatchHistoryAchievements(id),
    getPlayerSeasonAchievements(id),
    getCurrentStreak(id),
    getLeaderboardRank(id),
  ]);
  // Practice matches still show up in the list below (clearly labeled) but
  // never count toward the record/win-rate/streak — same "never touches
  // your main profile" promise as everywhere else practice mode is handled.
  const realRecentHistory = recentHistory.filter((m) => !m.isPracticing);
  const realRecentWins = realRecentHistory.filter((m) => m.won).length;
  const winRate = realRecentHistory.length > 0 ? Math.round((realRecentWins / realRecentHistory.length) * 100) : null;
  const mostRecentRealMatchId = recentHistory.find((m) => !m.isPracticing)?.id ?? null;
  // Only the current rating is gated on the player's *current* status — it's
  // the number that isn't public until they graduate. The chart and the peaks
  // below read history the server already filtered (see getHiddenRatingMatchIds),
  // so they keep earlier seasons and simply omit the active season's opening
  // window.
  const ratingVisible = isRatingVisible(gamesPlayed, isModerator);
  const practiceRatingVisible = isRatingVisible(practiceGamesPlayed, isModerator);
  const achievements = [
    ...computeAchievements(careerStats),
    ...computeRatingMilestoneAchievements(careerStats.peakRating),
    ...matchAchievements,
    ...seasonAchievements,
  ].sort(achievementComparator);

  return (
    <>
      {seasonStats && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-medium">
              {lang === "es" ? "Temporada actual" : "Current season"}
              {seasonStats.seasonName && ` · ${seasonStats.seasonName}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {lang === "es" ? "Se reinicia al terminar la temporada." : "Resets when the season ends."}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                {ratingVisible ? (
                  <p className="text-lg font-semibold tabular-nums">{formatRating(rating)}</p>
                ) : (
                  <p className="text-sm font-medium text-muted-foreground">
                    <RatingHidden gamesPlayed={gamesPlayed} lang={lang} />
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{lang === "es" ? "Clasificación" : "Rating"}</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">
                  {leaderboardRank.rank ? (
                    <>
                      #{leaderboardRank.rank}
                      <span className="text-sm">/{leaderboardRank.totalPlayers}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {lang === "es" ? "Posición en el ladder" : "Leaderboard rank"}
                </p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{seasonStats.setsPlayed}</p>
                <p className="text-xs text-muted-foreground">{lang === "es" ? "Partidas jugadas" : "Sets played"}</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">
                  {seasonStats.totalWins}-{seasonStats.totalLosses}
                </p>
                <p className="text-xs text-muted-foreground">
                  {lang === "es" ? "Récord de temporada" : "Season record"}
                </p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">
                  {seasonStats.peakRating != null ? formatRating(seasonStats.peakRating) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {lang === "es" ? "Clasificación máxima de temporada" : "Season peak rating"}
                </p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{seasonStats.bestWinStreak}</p>
                <p className="text-xs text-muted-foreground">
                  {lang === "es" ? "Mejor racha de temporada" : "Season best win streak"}
                </p>
              </div>
              <div>
                {practiceRatingVisible ? (
                  <p className="text-lg font-semibold tabular-nums">{formatRating(practiceRating)}</p>
                ) : (
                  <p className="text-sm font-medium text-muted-foreground">
                    <RatingHidden gamesPlayed={practiceGamesPlayed} lang={lang} practice />
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {lang === "es" ? "Clasificación de práctica" : "Practice rating"}
                </p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{practiceGamesPlayed}</p>
                <p className="text-xs text-muted-foreground">
                  {lang === "es" ? "Partidas de práctica" : "Practice sets"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {chartPoints.length >= 2 && (
        <Card className="mt-4">
          <CardContent className="pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">{lang === "es" ? "Clasificación en el tiempo" : "Rating over time"}</p>
              <div className="flex gap-2">
                {winRate !== null && (
                  <Badge variant="outline" className="tabular-nums">
                    {lang === "es" ? `${winRate}% de victorias` : `${winRate}% win rate`}
                  </Badge>
                )}
                {streak > 0 && (
                  <Badge variant="success" className="tabular-nums">
                    {lang === "es" ? `${streak} victorias seguidas` : `${streak} win streak`}
                  </Badge>
                )}
              </div>
            </div>
            <RatingChart points={chartPoints.map((p) => ({ date: p.date.toISOString(), rating: p.rating }))} />
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardContent className="pt-4">
          <p className="text-sm font-medium">{lang === "es" ? "Carrera" : "Career"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lang === "es" ? "No se reinicia entre temporadas." : "Doesn't reset between seasons."}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-lg font-semibold tabular-nums">
                {careerStats.totalWins}-{careerStats.totalLosses}
              </p>
              <p className="text-xs text-muted-foreground">
                {lang === "es" ? "Récord de por vida" : "Lifetime record"}
              </p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">
                {careerStats.peakRating != null ? formatRating(careerStats.peakRating) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">{lang === "es" ? "Clasificación máxima" : "Peak rating"}</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">{careerStats.bestWinStreak}</p>
              <p className="text-xs text-muted-foreground">
                {lang === "es" ? "Mejor racha de victorias" : "Best win streak"}
              </p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">{careerStats.seasonsPlayed}</p>
              <p className="text-xs text-muted-foreground">{lang === "es" ? "Temporadas jugadas" : "Seasons played"}</p>
            </div>
          </div>

          <p className="mt-5 text-sm font-medium">{lang === "es" ? "Logros" : "Achievements"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {achievements.map((a, i) => {
              const display = lang === "es" ? achievementEs(a) : a;
              return (
                <Tooltip key={a.id}>
                  <TooltipTrigger asChild>
                    <Badge
                      variant={a.achieved ? "success" : "outline"}
                      className={a.achieved ? "badge-pop gap-1 cursor-help" : "gap-1 cursor-help opacity-40"}
                      style={a.achieved ? { animationDelay: `${i * 60}ms` } : undefined}
                    >
                      <Award className="size-3" />
                      {display.label}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>{display.description}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {rivals.length > 0 && (
        <Card className="mt-4">
          <CardContent className="pt-4">
            <p className="text-sm font-medium">{lang === "es" ? "Rivales" : "Rivals"}</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {rivals.map((r) => (
                <li key={r.opponentId} className="flex items-center justify-between text-sm">
                  <Link href={`/players/${r.opponentId}`} className="flex items-center gap-1.5 hover:underline">
                    <Swords className="size-3.5 text-muted-foreground" />
                    {r.username}
                  </Link>
                  <span className="tabular-nums text-muted-foreground">
                    {r.wins}W–{r.losses}L
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <CharacterUsageCard usage={usage} mainCharacter={mainCharacter} lang={lang} />
      {usage.length > 0 && (
        <p className="mt-1.5 text-right text-xs">
          <Link
            href="?tab=characters"
            prefetch={false}
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            {lang === "es" ? "Ver detalles →" : "View details →"}
          </Link>
        </p>
      )}

      <div className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {lang === "es" ? "Historial de partidas" : "Match history"}
            </h2>
            {totalMatchCount > 0 && (
              <Badge variant="outline">
                {lang === "es"
                  ? `${totalMatchCount} ${totalMatchCount === 1 ? "partida confirmada" : "partidas confirmadas"}`
                  : `${totalMatchCount} confirmed match${totalMatchCount === 1 ? "" : "es"}`}
              </Badge>
            )}
          </div>
          {totalMatchCount > 0 && (
            <Link
              href="?tab=matches"
              prefetch={false}
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              {lang === "es" ? "Ver más →" : "View more →"}
            </Link>
          )}
        </div>

        {recentMatchHistory.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            {lang === "es" ? "Aún no hay partidas confirmadas." : "No confirmed matches yet."}
          </p>
        )}

        {recentMatchHistory.length > 0 && (
          <MatchHistoryList
            playerId={id}
            playerUsername={playerUsername}
            matches={recentMatchHistory}
            mostRecentRealMatchId={mostRecentRealMatchId}
            hiddenChangeIds={hiddenChangeIds}
            isOwnProfile={isOwnProfile}
            isModerator={isModerator}
            lang={lang}
          />
        )}
      </div>
    </>
  );
}
