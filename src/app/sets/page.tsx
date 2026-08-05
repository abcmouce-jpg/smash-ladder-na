import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { Radio, ExternalLink, MapPin } from "lucide-react";
import { getMatchFeed, type MatchFeedEntry } from "@/lib/match-feed";
import { RankBadge } from "@/components/rank-badge";
import { CharacterIcon } from "@/components/character-icon";
import { TwitchLiveEmbed } from "@/components/twitch-live-embed";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SetsFeedPoller } from "@/components/sets-feed-poller";

const STATUS_LABEL: Record<string, string> = {
  PENDING_REPORT: "In progress",
  REPORTED: "In progress",
  DISPUTED: "Disputed",
  CONFIRMED: "Final",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
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
  const entries = await getMatchFeed();
  const parentHost = (await headers()).get("host") ?? "smash-ladder-na.vercel.app";

  const liveEntries = entries.filter((e) => e.hasLiveStreamer);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <SetsFeedPoller />
      <h1 className="text-2xl font-semibold tracking-tight">Sets</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Current and recently-finished sets across the ladder. Sets with a live Twitch stream are
        pinned to the top.
      </p>

      {liveEntries.length > 0 && (
        <div className="mt-8 flex flex-col gap-4">
          {liveEntries.map((entry) => (
            <LiveSetCard key={entry.id} entry={entry} parentHost={parentHost} />
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-col gap-2">
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground">No sets in progress or recently finished.</p>
        )}
        {entries.map((entry) => (
          <SetRow key={entry.id} entry={entry} />
        ))}
      </div>
    </main>
  );
}

function streamingPlayer(entry: MatchFeedEntry) {
  if (entry.player1Live) return entry.player1;
  if (entry.player2Live) return entry.player2;
  return null;
}

function LiveSetCard({ entry, parentHost }: { entry: MatchFeedEntry; parentHost: string }) {
  const streamer = streamingPlayer(entry);
  if (!streamer?.twitchUsername) return null;
  const opponent = streamer.id === entry.player1.id ? entry.player2 : entry.player1;

  return (
    <Card className="border-red-500/30">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <a
            href={`https://twitch.tv/${streamer.twitchUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium text-red-500 hover:underline"
          >
            <Radio className="size-4" />
            {streamer.twitchDisplayName ?? streamer.username} is live
            <ExternalLink className="size-3" />
          </a>
          <Badge variant={STATUS_VARIANT[entry.status] ?? "outline"}>
            {STATUS_LABEL[entry.status] ?? entry.status}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          <PlayerLink player={streamer} /> vs <PlayerLink player={opponent} />
          {entry.games.length > 0 && (
            <span className="tabular-nums">
              {" "}
              ({streamer.id === entry.player1.id ? entry.wins.player1 : entry.wins.player2}–
              {streamer.id === entry.player1.id ? entry.wins.player2 : entry.wins.player1})
            </span>
          )}
        </p>
        <TwitchLiveEmbed username={streamer.twitchUsername} parentHost={parentHost} />
      </CardContent>
    </Card>
  );
}

function PlayerLink({ player }: { player: { id: string; username: string } }) {
  return (
    <Link href={`/players/${player.id}`} className="font-medium text-foreground hover:underline">
      {player.username}
    </Link>
  );
}

function SetRow({ entry }: { entry: MatchFeedEntry }) {
  const winnerId = entry.status === "CONFIRMED" ? entry.reportedWinnerId : null;

  return (
    <Card className={entry.hasLiveStreamer ? "border-red-500/30" : undefined}>
      <CardContent className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SetPlayer player={entry.player1} won={winnerId === entry.player1.id} live={entry.player1Live} />
          <span className="shrink-0 text-xs text-muted-foreground">vs</span>
          <SetPlayer player={entry.player2} won={winnerId === entry.player2.id} live={entry.player2Live} />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          {entry.games.length > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {entry.wins.player1}–{entry.wins.player2}
            </span>
          )}
          <Badge variant={STATUS_VARIANT[entry.status] ?? "outline"}>
            {STATUS_LABEL[entry.status] ?? entry.status}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function SetPlayer({
  player,
  won,
  live,
}: {
  player: MatchFeedEntry["player1"];
  won: boolean;
  live: boolean;
}) {
  return (
    <Link href={`/players/${player.id}`} className="flex min-w-0 items-center gap-1.5 hover:underline">
      {player.avatarUrl && (
        <Image src={player.avatarUrl} alt="" width={20} height={20} className="shrink-0 rounded-full" />
      )}
      {player.mainCharacter && <CharacterIcon name={player.mainCharacter} size={18} />}
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1">
          <span className={`truncate text-sm ${won ? "font-semibold" : "font-medium"}`}>{player.username}</span>
          {live && <Radio className="size-3 shrink-0 text-red-500" />}
          <RankBadge rating={player.rating} gamesPlayed={player.gamesPlayed} className="hidden shrink-0 sm:inline-flex" />
        </span>
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{player.rating}</span>
          {player.region && (
            <span className="flex min-w-0 items-center gap-0.5">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{player.region}</span>
            </span>
          )}
        </span>
        <RankBadge rating={player.rating} gamesPlayed={player.gamesPlayed} className="mt-0.5 shrink self-start sm:hidden" />
      </span>
    </Link>
  );
}
