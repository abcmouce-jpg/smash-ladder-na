import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { SectionTabs } from "@/components/section-tabs";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { BanIpButton, ModerationStatusForm } from "@/components/moderation-tools";
import { auth } from "@/auth";
import { getLang } from "@/lib/i18n";
import { getCharacterUsage, getCurrentMatchForUser, getHeadToHead, getPlayerProfile } from "@/lib/players";
import { isTwitchLive } from "@/lib/twitch-helix";
import { getLiveYouTubeStreams } from "@/lib/youtube-oauth";
import { isBlockedByMe } from "@/lib/blocks";
import { listReportsForUser } from "@/lib/reports";
import { banPlayerIpAction, blockUserAction, deleteAccountAction, moderateUserAction } from "../actions";
import { PlayerProfileHeader } from "./profile-header";
import { ProfileOverviewSection } from "./profile-overview";
import { ProfileCharactersSection } from "./profile-characters";
import { ProfileHeadToHeadSection } from "./profile-headtohead";
import { ProfileSeasonsSection } from "./profile-seasons";
import { ProfileMatchHistorySection } from "./profile-match-history";
import { tr } from "@/lib/lang";
import { prisma } from "@/lib/db";
import { UserStatus } from "@/generated/prisma/enums";
import { DELETED_USERNAME } from "@/lib/account";
import { echoGroupLabel, type SmashCharacter } from "@/lib/characters";
import { isRatingVisible, LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { SITE_NAME } from "@/lib/site";

// The profile's sections, driven purely by the `?tab=` query param so
// every view stays server-rendered and deep-linkable — no client tab state.
const VALID_TABS = ["overview", "characters", "headtohead", "seasons", "matches"] as const;
type ProfileTab = (typeof VALID_TABS)[number];

// Every one of the tabs above, and every page of the ones that paginate, is a
// separate URL for the same profile, and until now none of them said so: Search
// Console had 422 of them filed as "duplicate, no user-selected canonical" and
// another thousand as "crawled - currently not indexed", all of the shape
// /players/<id>?tab=headtohead&page=2. The canonical below points every variant
// back at the bare profile.
//
// The title and description are per player for the same reason. The root
// layout's are a site-wide default, so ~6,000 indexed profile pages were all
// announcing themselves as "Smash Ladder NA" with the same one-line
// description — which is what a thin, machine-generated site looks like from
// the outside, and that is the one complaint Google's AdSense mail keeps
// making about this site.
//
// Profiles below the leaderboard floor are left out of the index on purpose.
// A profile for an account that has never played holds nothing but chrome, and
// there are thousands of them; indexing them buries the pages that do have
// something on them. The floor is LEADERBOARD_MIN_GAMES rather than a number
// of its own so "in the index" lines up with "has a public rating" (see
// isRatingVisible) — a page whose main number is hidden from the reader has
// nothing to offer a searcher either.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [player, lang] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        username: true,
        region: true,
        mainCharacter: true,
        rating: true,
        gamesPlayed: true,
        status: true,
      },
    }),
    getLang(),
  ]);
  if (!player) return {};

  const canonical = `/players/${id}`;
  const indexable =
    player.gamesPlayed >= LEADERBOARD_MIN_GAMES &&
    player.status !== UserStatus.BANNED &&
    player.username !== DELETED_USERNAME;

  const main = player.mainCharacter ? echoGroupLabel(player.mainCharacter as SmashCharacter, lang) : null;
  const rating = isRatingVisible(player.gamesPlayed, false) ? Math.round(player.rating) : null;

  return {
    title: `${player.username} — ${SITE_NAME}`,
    description: tr(lang, {
      en:
        `${player.username} on ${SITE_NAME}` +
        (player.region ? `, playing out of ${player.region}` : "") +
        (main ? `, mains ${main}` : "") +
        ". " +
        (rating === null
          ? `${player.gamesPlayed} rated ${player.gamesPlayed === 1 ? "set" : "sets"} played so far.`
          : `Rating ${rating} over ${player.gamesPlayed} rated sets — match history, head-to-head records and character stats.`),
      es:
        `${player.username} en ${SITE_NAME}` +
        (player.region ? `, juega desde ${player.region}` : "") +
        (main ? `, principal ${main}` : "") +
        ". " +
        (rating === null
          ? `${player.gamesPlayed} ${player.gamesPlayed === 1 ? "set jugado" : "sets jugados"} hasta ahora.`
          : `Clasificación ${rating} en ${player.gamesPlayed} sets — historial, cara a cara y estadísticas por personaje.`),
    }),
    alternates: { canonical },
    robots: indexable ? undefined : { index: false, follow: true },
  };
}

export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string;
    tab?: string;
    char?: string;
    season?: string;
    character?: string;
    against?: string;
  }>;
}) {
  const { id } = await params;
  const {
    page: pageParam,
    tab: tabParam,
    char: charParam,
    season: seasonParam,
    character: characterParam,
    against: againstParam,
  } = await searchParams;
  const requestedPage = Number(pageParam);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [session, lang] = await Promise.all([auth(), getLang()]);
  const isOwnProfile = session?.user?.id === id;
  const isModerator = session?.user?.role === "MOD" || session?.user?.role === "ADMIN";
  const tab: ProfileTab =
    VALID_TABS.includes((tabParam ?? "") as ProfileTab) && tabParam ? (tabParam as ProfileTab) : "overview";

  const player = await getPlayerProfile(id, isModerator);
  if (!player) notFound();

  const [characterUsage, currentMatch, blocked, headToHead] = await Promise.all([
    getCharacterUsage(id),
    getCurrentMatchForUser(id),
    session?.user?.id && !isOwnProfile ? isBlockedByMe(session.user.id, id) : Promise.resolve(false),
    session?.user?.id && !isOwnProfile ? getHeadToHead(session.user.id, id) : Promise.resolve(null),
  ]);
  const [isLiveOnTwitch, liveYouTube] = await Promise.all([
    player.twitchUsername ? isTwitchLive(player.twitchUsername) : Promise.resolve(false),
    getLiveYouTubeStreams([id]),
  ]);
  const youtubeLive = liveYouTube.get(id) ?? null;
  const parentHost = (await headers()).get("host") ?? "smash-ladder-na.vercel.app";
  const reportHistory = isModerator ? await listReportsForUser(id) : [];

  const tabLabel = (en: string, es: string) => tr(lang, { en, es });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <PlayerProfileHeader
        player={player}
        characterUsage={characterUsage}
        headToHead={headToHead}
        blocked={blocked}
        currentMatch={currentMatch}
        isLiveOnTwitch={isLiveOnTwitch}
        youtubeLive={youtubeLive}
        parentHost={parentHost}
        viewerId={session?.user?.id ?? null}
        isOwnProfile={isOwnProfile}
        isModerator={isModerator}
        blockAction={blockUserAction.bind(null, id)}
        lang={lang}
      />

      <SectionTabs
        className="mt-8"
        items={[
          { href: "?tab=overview", label: tabLabel("Overview", "Resumen"), active: tab === "overview" },
          {
            href: "?tab=matches",
            label: tabLabel("Match History", "Historial de partidas"),
            active: tab === "matches",
          },
          {
            href: "?tab=characters",
            label: tabLabel("Characters", "Personajes"),
            active: tab === "characters",
          },
          {
            href: "?tab=headtohead",
            label: tabLabel("Head 2 Heads", "Cara a Cara"),
            active: tab === "headtohead",
          },
          { href: "?tab=seasons", label: tabLabel("Seasons", "Temporadas"), active: tab === "seasons" },
        ]}
      />

      <div className="mt-6">
        {tab === "overview" && (
          <ProfileOverviewSection
            id={id}
            playerUsername={player.username}
            mainCharacter={player.mainCharacter}
            usage={characterUsage}
            rating={player.rating}
            gamesPlayed={player.gamesPlayed}
            practiceRating={player.practiceRating}
            randittoRating={player.randittoRating}
            randittoGamesPlayed={player.randittoGamesPlayed}
            practiceGamesPlayed={player.practiceGamesPlayed}
            isOwnProfile={isOwnProfile}
            isModerator={isModerator}
            parentHost={parentHost}
            lang={lang}
          />
        )}
        {tab === "characters" && (
          <ProfileCharactersSection
            id={id}
            mainCharacter={player.mainCharacter}
            usage={characterUsage}
            charParam={charParam}
            lang={lang}
          />
        )}
        {tab === "headtohead" && <ProfileHeadToHeadSection id={id} page={page} lang={lang} />}
        {tab === "seasons" && <ProfileSeasonsSection id={id} lang={lang} />}
        {tab === "matches" && (
          <ProfileMatchHistorySection
            id={id}
            playerUsername={player.username}
            page={page}
            seasonParam={seasonParam}
            playedParam={characterParam}
            againstParam={againstParam}
            isOwnProfile={isOwnProfile}
            isModerator={isModerator}
            parentHost={parentHost}
            lang={lang}
          />
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
                      variant={
                        r.status === "ACTIONED" ? "destructive" : r.status === "DISMISSED" ? "outline" : "warning"
                      }
                    >
                      {r.status.toLowerCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      by {r.reporter.username} · {r.createdAt.toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">{r.reason}</p>
                  {r.actionTaken && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      →{" "}
                      {r.actionTaken === "SUSPENDED"
                        ? r.actionSuspensionHours
                          ? `Suspended ${r.actionSuspensionHours}h`
                          : "Suspended indefinitely"
                        : "Banned"}
                      {r.actionedBy && ` by ${r.actionedBy.username}`}
                      {r.actionedAt && ` · ${r.actionedAt.toISOString().slice(0, 10)}`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6">
            <ModerationStatusForm action={moderateUserAction.bind(null, id)} currentStatus={player.status} />
          </div>

          {player.lastKnownIp && (
            <div className="mt-4">
              <BanIpButton action={banPlayerIpAction.bind(null, id, player.lastKnownIp)} ip={player.lastKnownIp} />
            </div>
          )}
        </div>
      )}

      {isOwnProfile && (
        <div className="mt-12 border-t border-border pt-6">
          <h2 className="text-sm font-medium text-destructive">
            {tr(lang, { en: "Danger zone", es: "Zona de peligro" })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tr(lang, {
              en: "Deletes your username, avatar, and email. Match history stays, anonymized, so other players' win/loss records stay accurate.",
              es: "Elimina tu nombre de usuario, avatar y correo electrónico. El historial de partidas se mantiene, anonimizado, para que los registros de victorias/derrotas de otros jugadores sigan siendo correctos.",
            })}
          </p>
          <div className="mt-3">
            <DeleteAccountButton action={deleteAccountAction} lang={lang} />
          </div>
        </div>
      )}
    </main>
  );
}
