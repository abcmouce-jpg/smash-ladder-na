import { headers } from "next/headers";
import { Activity, Radio, Swords } from "lucide-react";
import { getMatchFeed, getMatchFeedStats } from "@/lib/match-feed";
import { serializeSetEntry } from "@/lib/set-entry";
import { PageHeading } from "@/components/page-heading";
import { SetsFeedPoller } from "@/components/sets-feed-poller";
import { LiveStreamProvider } from "@/components/live-streams/selection";
import { LiveStreamStage } from "@/components/live-streams/stage";
import { getLang } from "@/lib/i18n";
import { SetRow } from "./set-row";

export default async function SetsFeedPage() {
  const [entries, { inProgress, matchesToday }, lang] = await Promise.all([
    getMatchFeed(),
    getMatchFeedStats(),
    getLang(),
  ]);
  const parentHost = (await headers()).get("host") ?? "smash-ladder-na.vercel.app";

  // Dates can't cross the server→client boundary, so entries are serialized
  // once and reused for both the pinned live section and the SetRow list.
  const serializedEntries = entries.map(serializeSetEntry);
  const liveEntries = serializedEntries.filter((e) => e.hasLiveStreamer);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <SetsFeedPoller />
      <PageHeading
        icon={Radio}
        title={lang === "es" ? "Partidas" : "Sets"}
        description={
          lang === "es"
            ? "Partidas en curso y recién terminadas en todo el ladder. Las partidas con un stream en vivo de Twitch se fijan arriba."
            : "Current and recently-finished sets across the ladder. Sets with a live Twitch stream are pinned to the top."
        }
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5 tabular-nums">
          <Swords className="size-3.5 text-primary" />
          <span className="font-medium text-foreground">{inProgress}</span> {lang === "es" ? "en curso" : "in progress"}
        </span>
        <span className="flex items-center gap-1.5 tabular-nums">
          <Activity className="size-3.5 text-primary" />
          <span className="font-medium text-foreground">{matchesToday}</span>{" "}
          {lang === "es" ? "partidas hoy" : "matches today"}
        </span>
      </div>

      <LiveStreamProvider>
        {liveEntries.length > 0 && (
          <section className="mt-8 flex flex-col gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide">
              <Radio aria-hidden className="size-4 text-red-500" />
              {lang === "es" ? "En vivo ahora" : "Live now"}
            </h2>
            <LiveStreamStage entries={liveEntries} parentHost={parentHost} />
          </section>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {serializedEntries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {lang === "es"
                ? "No hay partidas en curso ni recién terminadas."
                : "No sets in progress or recently finished."}
            </p>
          )}
          {serializedEntries.map((entry) => (
            <SetRow key={entry.id} entry={entry} lang={lang} />
          ))}
        </div>
      </LiveStreamProvider>
    </main>
  );
}
