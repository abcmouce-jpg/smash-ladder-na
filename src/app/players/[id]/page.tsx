import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, Cable, ExternalLink, MapPin, Swords } from "lucide-react";
import { auth } from "@/auth";
import {
  currentStreak,
  getCareerStats,
  getCharacterUsage,
  getPlayerMatchHistory,
  getPlayerProfile,
  getRatingChartPoints,
  getTopRivals,
} from "@/lib/players";
import { computeAchievements } from "@/lib/rank-tier";
import { CharacterIcon } from "@/components/character-icon";
import { CharacterUsageCard } from "@/components/character-usage-card";
import { RankBadge } from "@/components/rank-badge";
import { RatingChart } from "@/components/rating-chart";
import { LocalTime } from "@/components/local-time";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { BlockUserButton } from "@/components/block-user-button";
import { RequestCorrectionForm } from "@/components/request-correction-form";
import { AdminMatchOverride, BanIpButton, ModerationStatusForm } from "@/components/moderation-tools";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { isBlockedByMe } from "@/lib/blocks";
import { startggProfileUrl } from "@/lib/startgg-oauth";
import { listReportsForUser } from "@/lib/reports";
import {
  adminOverrideResultAction,
  banPlayerIpAction,
  blockUserAction,
  deleteAccountAction,
  moderateUserAction,
  requestCorrectionAction,
} from "../actions";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const isOwnProfile = session?.user?.id === id;
  const isModerator = session?.user?.role === "MOD" || session?.user?.role === "ADMIN";
  const player = await getPlayerProfile(id);
  if (!player) notFound();

  const [history, chartPoints, careerStats, rivals, blocked, characterUsage] = await Promise.all([
    getPlayerMatchHistory(id),
    getRatingChartPoints(id),
    getCareerStats(id),
    getTopRivals(id),
    session?.user?.id && !isOwnProfile ? isBlockedByMe(session.user.id, id) : Promise.resolve(false),
    getCharacterUsage(id),
  ]);
  const reportHistory = isModerator ? await listReportsForUser(id) : [];
  const topCharacters = characterUsage.slice(0, 3).map((u) => u.character);
  const wins = history.filter((m) => m.won).length;
  const losses = history.length - wins;
  const winRate = history.length > 0 ? Math.round((wins / history.length) * 100) : null;
  const streak = currentStreak(history);
  const achievements = computeAchievements(careerStats);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {player.avatarUrl && (
            <Image
              src={player.avatarUrl}
              alt={player.username}
              width={56}
              height={56}
              className="rounded-full"
            />
          )}
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {player.username}
              {player.mainCharacter && <CharacterIcon name={player.mainCharacter} size={22} />}
              {player.secondaryCharacters.map((c) => (
                <CharacterIcon key={c} name={c} size={18} className="opacity-60" />
              ))}
            </h1>
            <p className="text-sm tabular-nums text-muted-foreground">
              {player.rating} rating · {player.gamesPlayed} games played
              {topCharacters.length > 0 && (
                <>
                  {" · "}
                  <span className="group/characters relative inline-flex items-center gap-1 align-middle">
                    <span className="pointer-events-none absolute -top-6 left-0 z-10 rounded border border-border bg-popover px-1.5 py-0.5 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover/characters:opacity-100">
                      Most played characters
                    </span>
                    {topCharacters.map((character) => (
                      <CharacterIcon key={character} name={character} size={16} />
                    ))}
                  </span>
                </>
              )}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <RankBadge rating={player.rating} gamesPlayed={player.gamesPlayed} />
              {player.region && (
                <Badge variant="outline">
                  <MapPin className="size-3" />
                  {player.region}
                </Badge>
              )}
              {player.wiredConnection && (
                <Badge variant="outline">
                  <Cable className="size-3" />
                  Wired
                </Badge>
              )}
              {player.noShowCount > 0 && (
                <Badge variant="warning">{player.noShowCount} no-show{player.noShowCount === 1 ? "" : "s"}</Badge>
              )}
              {player.cancelCount > 0 && (
                <Badge variant="warning">
                  {player.cancelCount} cancel{player.cancelCount === 1 ? "" : "s"}
                </Badge>
              )}
              {player._count.connectionReportsReceived > 0 && (
                <Badge variant="warning">
                  {player._count.connectionReportsReceived} connection report
                  {player._count.connectionReportsReceived === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
            {player.startggSlug && (
              <a
                href={startggProfileUrl(player.startggSlug)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {player.startggGamerTag ?? "View on start.gg"} ✓
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>

        {session?.user?.id && !isOwnProfile && (
          blocked ? (
            <Badge variant="outline">Blocked</Badge>
          ) : (
            <BlockUserButton action={blockUserAction.bind(null, id)} username={player.username} />
          )
        )}
      </div>

      {chartPoints.length >= 2 && (
        <Card className="mt-8">
          <CardContent className="pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Rating over time</p>
              <div className="flex gap-2">
                {winRate !== null && (
                  <Badge variant="outline" className="tabular-nums">
                    {winRate}% win rate
                  </Badge>
                )}
                {streak !== 0 && (
                  <Badge variant={streak > 0 ? "success" : "destructive"} className="tabular-nums">
                    {Math.abs(streak)} {streak > 0 ? "win" : "loss"} streak
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
          <p className="text-sm font-medium">Career</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Doesn&apos;t reset between seasons.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-lg font-semibold tabular-nums">
                {careerStats.totalWins}-{careerStats.totalLosses}
              </p>
              <p className="text-xs text-muted-foreground">Lifetime record</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">{careerStats.peakRating ?? "—"}</p>
              <p className="text-xs text-muted-foreground">Peak rating</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">{careerStats.seasonsPlayed}</p>
              <p className="text-xs text-muted-foreground">Seasons played</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">{careerStats.tournamentsEntered}</p>
              <p className="text-xs text-muted-foreground">Tournaments entered</p>
            </div>
          </div>

          <p className="mt-5 text-sm font-medium">Achievements</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {achievements.map((a, i) => (
              <Badge
                key={a.id}
                variant={a.achieved ? "success" : "outline"}
                className={a.achieved ? "badge-pop gap-1" : "gap-1 opacity-40"}
                style={a.achieved ? { animationDelay: `${i * 60}ms` } : undefined}
              >
                <Award className="size-3" />
                {a.label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {rivals.length > 0 && (
        <Card className="mt-4">
          <CardContent className="pt-4">
            <p className="text-sm font-medium">Rivals</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {rivals.map((r) => (
                <li key={r.opponentId} className="flex items-center justify-between text-sm">
                  <Link
                    href={`/players/${r.opponentId}`}
                    className="flex items-center gap-1.5 hover:underline"
                  >
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

      <CharacterUsageCard usage={characterUsage} mainCharacter={player.mainCharacter} />

      <div className="mt-10">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Recent matches</h2>
          {history.length > 0 && (
            <Badge variant="outline">
              {wins}W–{losses}L of last {history.length}
            </Badge>
          )}
        </div>

        {history.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">No confirmed matches yet.</p>
        )}

        {history.length > 0 && (
          <Card className="mt-4 divide-y divide-border overflow-hidden py-0">
            {history.map((match, i) => (
              <div key={match.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Badge variant={match.won ? "success" : "destructive"} className="w-6 justify-center">
                      {match.won ? "W" : "L"}
                    </Badge>
                    vs{" "}
                    <Link href={`/players/${match.opponent.id}`} className="hover:underline">
                      {match.opponent.username}
                    </Link>
                    {(match.score.wins > 0 || match.score.losses > 0) && (
                      <span className="tabular-nums text-muted-foreground">
                        {match.score.wins}–{match.score.losses}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {match.ratingBefore} → {match.ratingAfter} ({match.delta >= 0 ? "+" : ""}
                    {match.delta})
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{match.characters.length > 0 ? match.characters.join(", ") : "—"}</span>
                  {match.confirmedAt && <LocalTime iso={match.confirmedAt.toISOString()} />}
                </div>
                {isOwnProfile && i === 0 && (
                  <RequestCorrectionForm
                    action={requestCorrectionAction.bind(null, match.id)}
                    myId={id}
                    opponentId={match.opponent.id}
                    opponentUsername={match.opponent.username}
                  />
                )}
                {isModerator && !isOwnProfile && i === 0 && (
                  <AdminMatchOverride
                    player1Username={player.username}
                    player2Username={match.opponent.username}
                    actionForPlayer1={adminOverrideResultAction.bind(null, match.id, id, id)}
                    actionForPlayer2={adminOverrideResultAction.bind(null, match.id, id, match.opponent.id)}
                  />
                )}
              </div>
            ))}
          </Card>
        )}
      </div>

      {isModerator && !isOwnProfile && (
        <div className="mt-12 border-t border-border pt-6">
          <p className="text-sm font-medium">
            Report history <Badge variant="outline">{reportHistory.length}</Badge>
          </p>
          {reportHistory.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No reports filed against this player.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {reportHistory.map((r) => (
                <li key={r.id} className="text-sm">
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={r.status === "ACTIONED" ? "destructive" : r.status === "DISMISSED" ? "outline" : "warning"}
                    >
                      {r.status.toLowerCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      by {r.reporter.username} · {r.createdAt.toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">{r.reason}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6">
            <ModerationStatusForm action={moderateUserAction.bind(null, id)} currentStatus={player.status} />
          </div>

          {player.lastKnownIp && (
            <div className="mt-4">
              <BanIpButton
                action={banPlayerIpAction.bind(null, id, player.lastKnownIp)}
                ip={player.lastKnownIp}
              />
            </div>
          )}
        </div>
      )}

      {isOwnProfile && (
        <div className="mt-12 border-t border-border pt-6">
          <h2 className="text-sm font-medium text-destructive">Danger zone</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deletes your username, avatar, and email. Match history stays, anonymized, so other
            players&apos; win/loss records stay accurate.
          </p>
          <div className="mt-3">
            <DeleteAccountButton action={deleteAccountAction} />
          </div>
        </div>
      )}
    </main>
  );
}
