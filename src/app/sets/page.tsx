import Link from "next/link";
import { headers } from "next/headers";
import { Activity, ExternalLink, Radio, Swords } from "lucide-react";
import { getMatchFeed, getMatchFeedStats, type MatchFeedEntry } from "@/lib/match-feed";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeading } from "@/components/page-heading";
import { SetsFeedPoller } from "@/components/sets-feed-poller";
import { TwitchLiveEmbed } from "@/components/twitch-live-embed";
import { getLang, type Lang } from "@/lib/i18n";
import { SetRow, type SerializedSetEntry } from "./set-row";
import { LiveStreamsCarousel } from "./live-streams-carousel";

function serialize(entry: MatchFeedEntry): SerializedSetEntry {
  return {
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    confirmedAt: entry.confirmedAt?.toISOString() ?? null,
  };
}

const STATUS_LABEL: Record<string, { en: string; es: string }> = {
  PENDING_REPORT: { en: "In progress", es: "En curso" },
  REPORTED: { en: "In progress", es: "En curso" },
  DISPUTED: { en: "Disputed", es: "En disputa" },
  CONFIRMED: { en: "Final", es: "Final" },
  CANCELLED: { en: "Cancelled", es: "Cancelada" },
  EXPIRED: { en: "Expired", es: "Expirada" },
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "outline"> = {
  PENDING_REPORT: "success",
  REPORTED: "success",
  DISPUTED: "warning",
  CONFIRMED: "outline",
  CANCELLED: "outline",
  EXPIRED: "outline",
};

export default async function SetsFeedPage() {
  const [entries, { inProgress, matchesToday }, lang] = await Promise.all([
    getMatchFeed(),
    getMatchFeedStats(),
    getLang(),
  ]);
  const parentHost = (await headers()).get("host") ?? "smash-ladder-na.vercel.app";

  // Dates can't cross the server→client boundary, so entries are serialized
  // once and reused for both the pinned live carousel and the SetRow list.
  const serializedEntries = entries.map(serialize);
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

      {liveEntries.length > 0 && (
        <section className="mt-8 flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-wide">
            <Radio aria-hidden className="size-4 text-red-500" />
            {lang === "es" ? "En vivo ahora" : "Live now"}
          </h2>
          {liveEntries.length === 1 ? (
            <LiveSetCard entry={liveEntries[0]} parentHost={parentHost} lang={lang} />
          ) : (
            <LiveStreamsCarousel entries={liveEntries} parentHost={parentHost} lang={lang} />
          )}
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
    </main>
  );
}

function streamingPlayer(entry: SerializedSetEntry) {
  if (entry.player1Live) return entry.player1;
  if (entry.player2Live) return entry.player2;
  return null;
}

// Pinned "watch now" card for a single live set — collapses to just the
// clickable header, and only mounts the Twitch player (network/CPU cost)
// when someone actually asks to see it. Several of these used to stack for
// multiple live entries; that's now a carousel, and this card only renders
// when there's exactly one live set.
function LiveSetCard({ entry, parentHost, lang }: { entry: SerializedSetEntry; parentHost: string; lang: Lang }) {
  const streamer = streamingPlayer(entry);
  if (!streamer?.twitchUsername) return null;
  const opponent = streamer.id === entry.player1.id ? entry.player2 : entry.player1;
  const label = STATUS_LABEL[entry.status];

  return (
    <Card className="border-red-500/30">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between gap-3">
          <a
            href={`https://twitch.tv/${streamer.twitchUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-red-500 hover:underline"
          >
            <Radio className="size-4 shrink-0" />
            <span className="truncate">
              {streamer.twitchDisplayName ?? streamer.username} {lang === "es" ? "está en vivo" : "is live"}
            </span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
          <Badge variant={STATUS_VARIANT[entry.status] ?? "outline"} className="shrink-0">
            {lang === "es" ? label?.es : label?.en}
          </Badge>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          <Link href={`/players/${streamer.id}`} className="font-medium text-foreground hover:underline">
            {streamer.username}
          </Link>{" "}
          {lang === "es" ? "contra" : "vs"}{" "}
          <Link href={`/players/${opponent.id}`} className="font-medium text-foreground hover:underline">
            {opponent.username}
          </Link>
          {entry.games.some((g) => g.winnerId !== null) && (
            <span className="tabular-nums">
              {" "}
              ({entry.wins.player1}–{entry.wins.player2})
            </span>
          )}
        </p>
        <TwitchLiveEmbed username={streamer.twitchUsername} parentHost={parentHost} />
      </CardContent>
    </Card>
  );
}
