import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { winRateVariant } from "@/components/character-usage-card";
import type { HeadToHeadOpponent } from "@/lib/profile-stats";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";

function OpponentAvatar({ avatarUrl, username }: { avatarUrl: string | null; username: string }) {
  if (avatarUrl) {
    return <Image src={avatarUrl} alt={username} width={28} height={28} className="size-7 shrink-0 rounded-full" />;
  }
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
    >
      {username.charAt(0).toUpperCase()}
    </span>
  );
}

// A single head-to-head record line: opponent identity, sets played, the W–L
// record and a win-rate bar. Shared by the Head 2 Heads tab and the Overview
// card's top-3 preview so both read identically. Rows link through to the
// opponent's own profile. `flush` drops the horizontal padding so the row
// lines up with its host card's content instead of being double-indented.
export function HeadToHeadRow({
  opponent: o,
  lang,
  flush = false,
}: {
  opponent: HeadToHeadOpponent;
  lang: Lang;
  flush?: boolean;
}) {
  return (
    <div className={cn("py-2.5", !flush && "px-4")}>
      <div className="flex items-center gap-2.5">
        <OpponentAvatar avatarUrl={o.avatarUrl} username={o.username} />
        <Link
          href={`/players/${o.opponentId}`}
          prefetch={false}
          className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
        >
          {o.username}
        </Link>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {tr(lang, {
            en: `${o.games} set${o.games === 1 ? "" : "s"}`,
            es: `${o.games} ${o.games === 1 ? "partida" : "partidas"}`,
            ja: `${o.games}セット`,
          })}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {o.wins}W–{o.losses}L
        </span>
        <Badge variant={winRateVariant(o.winRate)} className="w-12 shrink-0 justify-center tabular-nums">
          {o.winRate}%
        </Badge>
      </div>
      <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-emerald-500" style={{ width: `${o.winRate}%` }} />
        <div className="h-full bg-destructive" style={{ width: `${100 - o.winRate}%` }} />
      </div>
    </div>
  );
}

export function HeadToHeadList({
  opponents,
  lang,
  className,
  bordered = true,
}: {
  opponents: HeadToHeadOpponent[];
  lang: Lang;
  className?: string;
  bordered?: boolean;
}) {
  const rows = opponents.map((o) => <HeadToHeadRow key={o.opponentId} opponent={o} lang={lang} flush={!bordered} />);
  // The tab wants its own card; the Overview renders the same rows directly
  // inside an existing card, so `bordered={false}` avoids a card-in-a-card.
  if (!bordered) {
    return <div className={cn("divide-y divide-border", className)}>{rows}</div>;
  }
  return <Card className={cn("divide-y divide-border overflow-hidden py-0", className)}>{rows}</Card>;
}
