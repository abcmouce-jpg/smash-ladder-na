import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { winRateVariant } from "@/components/character-usage-card";
import { getHeadToHeadOpponents } from "@/lib/profile-stats";
import type { Lang } from "@/lib/i18n";

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

// Every opponent this player has ever faced in ranked play, ranked by games
// played — the "who do they run into most, and how does it go?" tab. Rows
// link through to the opponent's own profile.
export async function ProfileHeadToHeadSection({ id, lang }: { id: string; lang: Lang }) {
  const opponents = await getHeadToHeadOpponents(id);

  if (opponents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "es" ? "Aún no hay oponentes registrados." : "No opponents recorded yet."}
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        {lang === "es"
          ? `${opponents.length} ${opponents.length === 1 ? "oponente distinto" : "oponentes distintos"}`
          : `${opponents.length} distinct ${opponents.length === 1 ? "opponent" : "opponents"}`}
      </p>
      <Card className="mt-3 divide-y divide-border overflow-hidden py-0">
        {opponents.map((o) => (
          <div key={o.opponentId} className="px-4 py-2.5">
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
                {lang === "es"
                  ? `${o.games} ${o.games === 1 ? "partida" : "partidas"}`
                  : `${o.games} set${o.games === 1 ? "" : "s"}`}
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
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
