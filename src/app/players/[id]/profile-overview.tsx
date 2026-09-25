import Link from "next/link";
import { Award, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { RatingChart } from "@/components/rating-chart";
import { CharacterUsageCard } from "@/components/character-usage-card";
import { RequestCorrectionForm } from "@/components/request-correction-form";
import { MatchHistoryEntry } from "@/components/match-history-entry";
import { AdminMatchOverride } from "@/components/moderation-tools";
import {
  getCareerStats,
  getCurrentStreak,
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
import { achievementComparator, computeAchievements, computeRatingMilestoneAchievements } from "@/lib/rank-tier";
import type { Lang } from "@/lib/i18n";
import {
  adminCorrectOldResultAction,
  adminOverrideResultAction,
  adminUndoMatchAction,
  adminUndoOldMatchAction,
  getMatchChatLogAction,
  getMatchChatLogAsModAction,
  requestCorrectionAction,
} from "../actions";

const MATCH_HISTORY_PAGE_SIZE = 20;

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
// character usage, and the paginated match history. Kept server-rendered so
// the history stays deep-linkable (`?tab=overview&page=N`) with no client
// tab state.
export async function ProfileOverviewSection({
  id,
  playerUsername,
  mainCharacter,
  usage,
  rating,
  practiceRating,
  practiceGamesPlayed,
  isOwnProfile,
  isModerator,
  page,
  lang,
}: {
  id: string;
  playerUsername: string;
  mainCharacter: string | null;
  usage: CharacterUsage[];
  rating: number;
  practiceRating: number;
  practiceGamesPlayed: number;
  isOwnProfile: boolean;
  isModerator: boolean;
  page: number;
  lang: Lang;
}) {
  const [
    recentHistory,
    pageHistory,
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
    // Fixed to the true most-recent matches regardless of which page of
    // history is being viewed — the win-rate/streak badges near the rating
    // chart, and which match (if any) the correction/admin-override forms
    // below attach to, all need this to stay put on page 2+, not silently
    // reflect whatever's on the current page.
    getPlayerMatchHistory(id),
    getPlayerMatchHistory(id, { limit: MATCH_HISTORY_PAGE_SIZE, skip: (page - 1) * MATCH_HISTORY_PAGE_SIZE }),
    getPlayerMatchCount(id),
    getRatingChartPoints(id),
    getCareerStats(id),
    getSeasonStats(id),
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
  const totalPages = Math.max(1, Math.ceil(totalMatchCount / MATCH_HISTORY_PAGE_SIZE));
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
                <p className="text-lg font-semibold tabular-nums">{rating}</p>
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
                <p className="text-lg font-semibold tabular-nums">{seasonStats.peakRating ?? "—"}</p>
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
                <p className="text-lg font-semibold tabular-nums">{practiceRating}</p>
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
              <p className="text-lg font-semibold tabular-nums">{careerStats.peakRating ?? "—"}</p>
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
          {totalPages > 1 && (
            <MatchHistoryPaginationControls playerId={id} page={page} totalPages={totalPages} lang={lang} />
          )}
        </div>

        {pageHistory.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            {lang === "es" ? "Aún no hay partidas confirmadas." : "No confirmed matches yet."}
          </p>
        )}

        {pageHistory.length > 0 && (
          <Card className="mt-4 divide-y divide-border overflow-hidden py-0">
            {pageHistory.map((match) => (
              <MatchHistoryEntry
                key={match.id}
                match={{
                  ...match,
                  // Dates can't cross the server→client boundary; the
                  // modal renders it back with LocalTime.
                  confirmedAt: match.confirmedAt?.toISOString() ?? null,
                }}
                viewedPlayerName={playerUsername}
                // Own profile reads their own chat log; a mod reviewing
                // someone else's profile gets the mod spectator path. The
                // modal is the only place this renders now.
                chatLogAction={
                  isOwnProfile
                    ? getMatchChatLogAction.bind(null, match.id)
                    : isModerator
                      ? getMatchChatLogAsModAction.bind(null, match.id)
                      : undefined
                }
                lang={lang}
              >
                {isOwnProfile && match.id === mostRecentRealMatchId && (
                  <RequestCorrectionForm
                    action={requestCorrectionAction.bind(null, match.id)}
                    myId={id}
                    opponentId={match.opponent.id}
                    opponentUsername={match.opponent.username}
                    lang={lang}
                  />
                )}
                {isModerator && !isOwnProfile && match.id === mostRecentRealMatchId && (
                  <AdminMatchOverride
                    player1Username={playerUsername}
                    player2Username={match.opponent.username}
                    actionForPlayer1={adminOverrideResultAction.bind(null, match.id, id, id)}
                    actionForPlayer2={adminOverrideResultAction.bind(null, match.id, id, match.opponent.id)}
                    undoAction={adminUndoMatchAction.bind(null, match.id, id)}
                  />
                )}
                {isModerator && !isOwnProfile && match.id !== mostRecentRealMatchId && (
                  // Same tool, for a match the player has since queued past —
                  // adminOverrideResultAction/adminUndoMatchAction require this
                  // to still be each side's most recent confirmed match, which
                  // stops applying the moment they play again. These use the
                  // relative-delta correction instead (see
                  // adminCorrectOldMatchResult/adminUndoOldMatch), so a mod
                  // can still fix a bad result from days ago without needing
                  // to have caught it before the player's next set.
                  <AdminMatchOverride
                    player1Username={playerUsername}
                    player2Username={match.opponent.username}
                    actionForPlayer1={adminCorrectOldResultAction.bind(null, match.id, id, id)}
                    actionForPlayer2={adminCorrectOldResultAction.bind(null, match.id, id, match.opponent.id)}
                    undoAction={adminUndoOldMatchAction.bind(null, match.id, id)}
                  />
                )}
              </MatchHistoryEntry>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}

function MatchHistoryPaginationControls({
  playerId,
  page,
  totalPages,
  lang,
}: {
  playerId: string;
  page: number;
  totalPages: number;
  lang: Lang;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <MatchHistoryPageLink playerId={playerId} page={page - 1} disabled={page <= 1}>
        {lang === "es" ? "← Anterior" : "← Previous"}
      </MatchHistoryPageLink>
      <span className="text-muted-foreground tabular-nums">
        {lang === "es" ? `Página ${page} de ${totalPages}` : `Page ${page} of ${totalPages}`}
      </span>
      <MatchHistoryPageLink playerId={playerId} page={page + 1} disabled={page >= totalPages}>
        {lang === "es" ? "Siguiente →" : "Next →"}
      </MatchHistoryPageLink>
    </div>
  );
}

function MatchHistoryPageLink({
  playerId,
  page,
  disabled,
  children,
}: {
  playerId: string;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-muted-foreground/40">{children}</span>;
  }
  // Pinned to the overview tab so paging keeps the tab strip where the user
  // left it instead of silently dropping back to a bare `/players/:id` URL.
  return (
    <Link href={`/players/${playerId}?tab=overview&page=${page}`} prefetch={false} className="hover:underline">
      {children}
    </Link>
  );
}
