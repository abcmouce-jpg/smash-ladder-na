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
import { isBlockedByMe } from "@/lib/blocks";
import { pointsToNextTier } from "@/lib/rank-tier";
import { listReportsForUser } from "@/lib/reports";
import { banPlayerIpAction, blockUserAction, deleteAccountAction, moderateUserAction } from "../actions";
import { PlayerProfileHeader } from "./profile-header";
import { ProfileOverviewSection } from "./profile-overview";
import { ProfileCharactersSection } from "./profile-characters";
import { ProfileHeadToHeadSection } from "./profile-headtohead";
import { ProfileSeasonsSection } from "./profile-seasons";

// The profile's four sections, driven purely by the `?tab=` query param so
// every view stays server-rendered and deep-linkable — no client tab state.
const VALID_TABS = ["overview", "characters", "headtohead", "seasons"] as const;
type ProfileTab = (typeof VALID_TABS)[number];

export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; tab?: string; char?: string }>;
}) {
  const { id } = await params;
  const { page: pageParam, tab: tabParam, char: charParam } = await searchParams;
  const requestedPage = Number(pageParam);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [session, lang] = await Promise.all([auth(), getLang()]);
  const isOwnProfile = session?.user?.id === id;
  const isModerator = session?.user?.role === "MOD" || session?.user?.role === "ADMIN";
  const tab: ProfileTab =
    VALID_TABS.includes((tabParam ?? "") as ProfileTab) && tabParam ? (tabParam as ProfileTab) : "overview";

  const player = await getPlayerProfile(id);
  if (!player) notFound();

  const [characterUsage, currentMatch, blocked, headToHead] = await Promise.all([
    getCharacterUsage(id),
    getCurrentMatchForUser(id),
    session?.user?.id && !isOwnProfile ? isBlockedByMe(session.user.id, id) : Promise.resolve(false),
    session?.user?.id && !isOwnProfile ? getHeadToHead(session.user.id, id) : Promise.resolve(null),
  ]);
  const isLiveOnTwitch = player.twitchUsername ? await isTwitchLive(player.twitchUsername) : false;
  const parentHost = (await headers()).get("host") ?? "smash-ladder-na.vercel.app";
  const nextTier = pointsToNextTier(player.rating, player.gamesPlayed);
  const reportHistory = isModerator ? await listReportsForUser(id) : [];

  const tabLabel = (label: string, es: string) => (lang === "es" ? es : label);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <PlayerProfileHeader
        player={player}
        characterUsage={characterUsage}
        nextTier={nextTier}
        headToHead={headToHead}
        blocked={blocked}
        currentMatch={currentMatch}
        isLiveOnTwitch={isLiveOnTwitch}
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
          { href: "?tab=characters", label: tabLabel("Characters", "Personajes"), active: tab === "characters" },
          { href: "?tab=headtohead", label: tabLabel("Head 2 Head", "Cara a Cara"), active: tab === "headtohead" },
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
            practiceGamesPlayed={player.practiceGamesPlayed}
            isOwnProfile={isOwnProfile}
            isModerator={isModerator}
            page={page}
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
        {tab === "headtohead" && <ProfileHeadToHeadSection id={id} lang={lang} />}
        {tab === "seasons" && <ProfileSeasonsSection id={id} lang={lang} />}
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
          <h2 className="text-sm font-medium text-destructive">{lang === "es" ? "Zona de peligro" : "Danger zone"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {lang === "es"
              ? "Elimina tu nombre de usuario, avatar y correo electrónico. El historial de partidas se mantiene, anonimizado, para que los registros de victorias/derrotas de otros jugadores sigan siendo correctos."
              : "Deletes your username, avatar, and email. Match history stays, anonymized, so other players' win/loss records stay accurate."}
          </p>
          <div className="mt-3">
            <DeleteAccountButton action={deleteAccountAction} lang={lang} />
          </div>
        </div>
      )}
    </main>
  );
}
