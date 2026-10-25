import { headers } from "next/headers";
import { Activity, Radio, Swords } from "lucide-react";
import { auth } from "@/auth";
import { getMatchFeed, getMatchFeedStats } from "@/lib/match-feed";
import { serializeSetEntry } from "@/lib/set-entry";
import { PageHeading } from "@/components/page-heading";
import { SetsFeedPoller } from "@/components/sets-feed-poller";
import { LiveStreamProvider } from "@/components/live-streams/selection";
import { LiveStreamStage } from "@/components/live-streams/stage";
import { getLang } from "@/lib/i18n";
import { SetRow } from "@/components/live-streams/set-row";
import { tr, trNode } from "@/lib/lang";

export default async function SetsFeedPage() {
  const [entries, { inProgress, matchesToday }, lang, session] = await Promise.all([
    getMatchFeed(),
    getMatchFeedStats(),
    getLang(),
    auth(),
  ]);
  // Provisional players' ratings stay hidden on the public feed unless the
  // viewer is a moderator (see isRatingVisible).
  const viewerIsModerator = session?.user?.role === "MOD" || session?.user?.role === "ADMIN";
  const parentHost = (await headers()).get("host") ?? "smash-ladder-na.vercel.app";

  // Dates can't cross the server→client boundary, so entries are serialized
  // once and reused for both the pinned live section and the SetRow list.
  const serializedEntries = entries.map(serializeSetEntry);
  const liveEntries = serializedEntries.filter((e) => e.hasLiveStreamer);

  // The pinned player resolves to the first live set's preferred side until a
  // pick is made (see resolveLiveStream); seeding the provider with that same
  // pick lets the row for the open stream mark its button selected from load.
  const firstLive = liveEntries[0];
  const initialSelection = firstLive
    ? { matchId: firstLive.id, playerId: firstLive.player1Live ? firstLive.player1.id : firstLive.player2.id }
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <SetsFeedPoller />
      <PageHeading
        icon={Radio}
        title={tr(lang, { en: "Live", es: "En vivo", ja: "配信" })}
        description={tr(lang, {
          en: "Current and recently-finished sets across the ladder. Sets with a live Twitch stream are pinned to the top.",
          es: "Partidas en curso y recién terminadas en todo el ladder. Las partidas con un stream en vivo de Twitch se fijan arriba.",
          ja: "進行中および直近で終了したセットの一覧です。Twitch で配信中のセットは上に固定されます。",
        })}
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5 tabular-nums">
          <Swords className="size-3.5 text-primary" />
          <span className="font-medium text-foreground">{inProgress}</span>{" "}
          {tr(lang, { en: "in progress", es: "en curso", ja: "進行中" })}
        </span>
        <span className="flex items-center gap-1.5 tabular-nums">
          <Activity className="size-3.5 text-primary" />
          <span>
            {trNode(lang, {
              en: (
                <>
                  <span className="font-medium text-foreground">{matchesToday}</span> matches today
                </>
              ),
              es: (
                <>
                  <span className="font-medium text-foreground">{matchesToday}</span> partidas hoy
                </>
              ),
              ja: (
                <>
                  今日の試合<span className="font-medium text-foreground">{matchesToday}</span>件
                </>
              ),
            })}
          </span>
        </span>
      </div>

      <LiveStreamProvider initialSelection={initialSelection}>
        {liveEntries.length > 0 && (
          <>
            <section className="mt-8 flex flex-col gap-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide">
                <Radio aria-hidden className="size-4 text-red-500" />
                {tr(lang, { en: "Live now", es: "En vivo ahora", ja: "配信中" })}
              </h2>
              <LiveStreamStage
                entries={liveEntries}
                parentHost={parentHost}
                lang={lang}
                viewerIsModerator={viewerIsModerator}
                setCard
              />
            </section>
            {/* Separates the pinned stream + its card from the feed list below,
                which repeats the same set. */}
            <hr className="mt-6 border-t border-border" />
          </>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {serializedEntries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {tr(lang, {
                en: "No sets in progress or recently finished.",
                es: "No hay partidas en curso ni recién terminadas.",
                ja: "進行中または直近で終了したセットはありません。",
              })}
            </p>
          )}
          {serializedEntries.map((entry) => (
            <SetRow key={entry.id} entry={entry} lang={lang} viewerIsModerator={viewerIsModerator} />
          ))}
        </div>
      </LiveStreamProvider>
    </main>
  );
}
