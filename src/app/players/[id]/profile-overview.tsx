import Link from "next/link";
import { Award } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { RatingChart } from "@/components/rating-chart";
import { RatingHidden } from "@/components/rating-hidden";
import { CharacterUsageCard } from "@/components/character-usage-card";
import { HeadToHeadList } from "./head-to-head-list";
import { MatchHistoryList } from "./match-history-list";
import {
  getCareerStats,
  getCurrentStreak,
  getHiddenRatingMatchIds,
  getPlayerMatchCount,
  getPlayerMatchHistory,
  getRatingChartPoints,
  getSeasonStats,
  type CharacterUsage,
} from "@/lib/players";
import { getHeadToHeadOpponents } from "@/lib/profile-stats";
import { getMatchHistoryAchievements } from "@/lib/match-achievements";
import { getLeaderboardRank } from "@/lib/leaderboard";
import { getPlayerSeasonAchievements } from "@/lib/seasons";
import {
  achievementComparator,
  computeAchievements,
  computeRatingMilestoneAchievements,
  isRatingVisible,
} from "@/lib/rank-tier";
import { formatRating, formatTrackRating } from "@/lib/rating-format";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

// The overview shows only the newest few matches so it stays a glance; the full
// — filterable, paginated — history lives on its own Match History tab.
const RECENT_MATCH_HISTORY_LIMIT = 10;

// Achievement labels/descriptions are generated in lib/rank-tier.ts and
// lib/match-achievements.ts (some with an interpolated rating threshold) —
// kept as a page-local id-keyed lookup rather than touching those files, same
// reasoning as the rank-tier description lookup in rank-tier-list.tsx. The
// rating-threshold achievements pull their number back out of the already-
// computed English description instead of re-importing minRatingFor.
type AchievementText = { label: string; description: string };

const ACHIEVEMENTS_ES: Record<string, AchievementText> = {
  "first-win": {
    label: "Primera victoria",
    description: "Gana tu primera partida rankeada.",
  },
  "ten-wins": {
    label: "10 victorias",
    description: "Gana 10 partidas rankeadas.",
  },
  "fifty-wins": {
    label: "50 victorias",
    description: "Gana 50 partidas rankeadas.",
  },
  veteran: {
    label: "3+ temporadas jugadas",
    description: "Juega en 3 o más temporadas del ladder.",
  },
  competitor: {
    label: "Entraste a un torneo",
    description: "Inscríbete a un torneo a través del sitio.",
  },
  "jack-of-trades": {
    label: "Todoterreno",
    description: "Gana una partida usando un personaje distinto cada juego.",
  },
  "mirror-match": {
    label: "Espejo",
    description: "Gana una partida en la que tú y tu rival usaron exactamente el mismo personaje todo el tiempo.",
  },
  "risky-business": {
    label: "Jugada arriesgada",
    description:
      "Usa el mismo personaje en los juegos 1-4 de una partida, cambia a otro personaje en el juego 5, y gánalo.",
  },
  globetrotter: {
    label: "Trotamundos",
    description: "Gana al menos un juego en cada escenario legal.",
  },
  "grudge-match": {
    label: "Revancha",
    description: "Vence a un rival que te venció la última vez que jugaron.",
  },
  "beginners-luck": {
    label: "Suerte de principiante",
    description: "Gana la primera partida que juegues en un día.",
  },
  "bounce-back": {
    label: "Recuperación",
    description: "Pierde la primera partida que juegues en un día, y gana la siguiente que juegues.",
  },
};

function localizeAchievement(a: { id: string; label: string; description: string }, lang: Lang): AchievementText {
  if (lang === "en") return a;
  const table = ACHIEVEMENTS_ES;
  const hit = table[a.id];
  if (hit) return hit;
  // Reached Elite/Master/Grandmaster/Legend — the rank names stay in English
  // because that is what the badges and the leaderboard call them. Pull the
  // threshold back out of the English description rather than re-deriving it.
  const rating = a.description.match(/\d+/)?.[0] ?? "";
  const tier = a.label.replace("Reached ", "");
  return {
    label: `Alcanzó ${tier}`,
    description: `Alcanza una clasificación de ${rating}.`,
  };
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
  randittoRating,
  randittoGamesPlayed,
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
  randittoRating: number;
  randittoGamesPlayed: number;
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
    rivalsResult,
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
    getHeadToHeadOpponents(id, { limit: 3 }),
    getMatchHistoryAchievements(id),
    getPlayerSeasonAchievements(id),
    getCurrentStreak(id),
    getLeaderboardRank(id),
  ]);
  // The Overview's Head 2 Heads card previews only the three most-played
  // opponents; the full, paginated list lives on the Head 2 Heads tab.
  const rivals = rivalsResult.opponents;
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
  const randittoRatingVisible = isRatingVisible(randittoGamesPlayed, isModerator);
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
              {tr(lang, {
                en: "Current season",
                es: "Temporada actual",
              })}
              {seasonStats.seasonName && ` · ${seasonStats.seasonName}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {tr(lang, {
                en: "Resets when the season ends.",
                es: "Se reinicia al terminar la temporada.",
              })}
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
                <p className="text-xs text-muted-foreground">
                  {tr(lang, {
                    en: "Rating",
                    es: "Clasificación",
                  })}
                </p>
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
                  {tr(lang, {
                    en: "Leaderboard rank",
                    es: "Posición en el ladder",
                  })}
                </p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{seasonStats.setsPlayed}</p>
                <p className="text-xs text-muted-foreground">
                  {tr(lang, {
                    en: "Sets played",
                    es: "Partidas jugadas",
                  })}
                </p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">
                  {seasonStats.totalWins}-{seasonStats.totalLosses}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tr(lang, {
                    en: "Season record",
                    es: "Récord de temporada",
                  })}
                </p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">
                  {seasonStats.peakRating != null ? formatRating(seasonStats.peakRating) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tr(lang, {
                    en: "Season peak rating",
                    es: "Clasificación máxima de temporada",
                  })}
                </p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{seasonStats.bestWinStreak}</p>
                <p className="text-xs text-muted-foreground">
                  {tr(lang, {
                    en: "Season best win streak",
                    es: "Mejor racha de temporada",
                  })}
                </p>
              </div>
              <div>
                {practiceRatingVisible ? (
                  <p className="text-lg font-semibold tabular-nums">{formatTrackRating(practiceRating, "practice")}</p>
                ) : (
                  <p className="text-sm font-medium text-muted-foreground">
                    <RatingHidden gamesPlayed={practiceGamesPlayed} lang={lang} practice />
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {tr(lang, {
                    en: "Practice rating",
                    es: "Clasificación de práctica",
                  })}
                </p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{practiceGamesPlayed}</p>
                <p className="text-xs text-muted-foreground">
                  {tr(lang, {
                    en: "Practice sets",
                    es: "Partidas de práctica",
                  })}
                </p>
              </div>
              {/* Shown here and not only on its board: a randitto rating was
                  otherwise invisible to the person who earned it until they
                  had five sets and appeared on the leaderboard. */}
              <div>
                {randittoRatingVisible ? (
                  <p className="text-lg font-semibold tabular-nums">{formatTrackRating(randittoRating, "randitto")}</p>
                ) : (
                  <p className="text-sm font-medium text-muted-foreground">
                    <RatingHidden gamesPlayed={randittoGamesPlayed} lang={lang} randitto />
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {tr(lang, {
                    en: "Randitto rating",
                    es: "Clasificación de Randitto",
                  })}
                </p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{randittoGamesPlayed}</p>
                <p className="text-xs text-muted-foreground">
                  {tr(lang, {
                    en: "Randitto sets",
                    es: "Partidas de Randitto",
                  })}
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
              <p className="text-sm font-medium">
                {tr(lang, {
                  en: "Rating over time",
                  es: "Clasificación en el tiempo",
                })}
              </p>
              <div className="flex gap-2">
                {winRate !== null && (
                  <Badge variant="outline" className="tabular-nums">
                    {tr(lang, {
                      en: `${winRate}% win rate`,
                      es: `${winRate}% de victorias`,
                    })}
                  </Badge>
                )}
                {streak > 0 && (
                  <Badge variant="success" className="tabular-nums">
                    {tr(lang, {
                      en: `${streak} win streak`,
                      es: `${streak} victorias seguidas`,
                    })}
                  </Badge>
                )}
              </div>
            </div>
            <RatingChart
              points={chartPoints.map((p) => ({
                date: p.date.toISOString(),
                rating: p.rating,
              }))}
              lang={lang}
            />
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardContent className="pt-4">
          <p className="text-sm font-medium">{tr(lang, { en: "Career", es: "Carrera" })}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tr(lang, {
              en: "Doesn't reset between seasons.",
              es: "No se reinicia entre temporadas.",
            })}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-lg font-semibold tabular-nums">
                {careerStats.totalWins}-{careerStats.totalLosses}
              </p>
              <p className="text-xs text-muted-foreground">
                {tr(lang, {
                  en: "Lifetime record",
                  es: "Récord de por vida",
                })}
              </p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">
                {careerStats.peakRating != null ? formatRating(careerStats.peakRating) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {tr(lang, {
                  en: "Peak rating",
                  es: "Clasificación máxima",
                })}
              </p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">{careerStats.bestWinStreak}</p>
              <p className="text-xs text-muted-foreground">
                {tr(lang, {
                  en: "Best win streak",
                  es: "Mejor racha de victorias",
                })}
              </p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">{careerStats.seasonsPlayed}</p>
              <p className="text-xs text-muted-foreground">
                {tr(lang, {
                  en: "Seasons played",
                  es: "Temporadas jugadas",
                })}
              </p>
            </div>
          </div>

          <p className="mt-5 text-sm font-medium">{tr(lang, { en: "Achievements", es: "Logros" })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {achievements.map((a, i) => {
              const display = localizeAchievement(a, lang);
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
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {tr(lang, {
                  en: "Head 2 Heads",
                  es: "Cara a Cara",
                })}
              </p>
              <Link
                href="?tab=headtohead"
                prefetch={false}
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {tr(lang, {
                  en: "View more →",
                  es: "Ver más →",
                })}
              </Link>
            </div>
            <HeadToHeadList opponents={rivals} lang={lang} bordered={false} className="mt-2" />
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
            {tr(lang, {
              en: "View details →",
              es: "Ver detalles →",
            })}
          </Link>
        </p>
      )}

      <div className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {tr(lang, {
                en: "Match history",
                es: "Historial de partidas",
              })}
            </h2>
            {totalMatchCount > 0 && (
              <Badge variant="outline">
                {tr(lang, {
                  en: `${totalMatchCount} confirmed match${totalMatchCount === 1 ? "" : "es"}`,
                  es: `${totalMatchCount} ${totalMatchCount === 1 ? "partida confirmada" : "partidas confirmadas"}`,
                })}
              </Badge>
            )}
          </div>
          {totalMatchCount > 0 && (
            <Link
              href="?tab=matches"
              prefetch={false}
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              {tr(lang, {
                en: "View more →",
                es: "Ver más →",
              })}
            </Link>
          )}
        </div>

        {recentMatchHistory.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            {tr(lang, {
              en: "No confirmed matches yet.",
              es: "Aún no hay partidas confirmadas.",
            })}
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
