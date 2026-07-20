import Image from "next/image";
import { notFound } from "next/navigation";
import { ExternalLink, Trophy } from "lucide-react";
import { auth } from "@/auth";
import { getTournament } from "@/lib/tournaments";
import { fetchStartggEventInfo } from "@/lib/startgg";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  cancelTournamentAction,
  joinTournamentAction,
  leaveTournamentAction,
  markCompletedAction,
  markInProgressAction,
  setStartggUrlAction,
} from "../actions";

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const tournament = await getTournament(id);
  if (!tournament) notFound();

  const userId = session?.user?.id;
  const role = session?.user?.role;
  const isHostOrMod = userId === tournament.hostId || role === "MOD" || role === "ADMIN";
  const myEntry = tournament.entries.find((e) => e.userId === userId);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">{tournament.name}</h1>
        <Badge variant="outline">{tournament.status.toLowerCase()}</Badge>
      </div>
      {tournament.description && (
        <p className="mt-2 text-sm text-muted-foreground">{tournament.description}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Hosted by {tournament.host.username} · Double elimination on start.gg
      </p>

      {tournament.startggUrl ? (
        <>
          <a href={tournament.startggUrl} target="_blank" rel="noopener noreferrer" className="mt-4 block">
            <Button type="button" className="gap-1.5">
              View bracket on start.gg
              <ExternalLink className="size-3.5" />
            </Button>
          </a>
          <StartggEventInfo startggUrl={tournament.startggUrl} />
        </>
      ) : (
        isHostOrMod && (
          <Card className="mt-4">
            <CardContent className="pt-4">
              <StartggForm tournamentId={id} />
            </CardContent>
          </Card>
        )
      )}

      <Card className="mt-6">
        <CardContent className="pt-4">
          <p className="text-sm font-medium">Entrants from the ladder ({tournament.entries.length})</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {tournament.entries.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                {e.user.avatarUrl && (
                  <Image
                    src={e.user.avatarUrl}
                    alt={e.user.username}
                    width={20}
                    height={20}
                    className="rounded-full"
                  />
                )}
                {e.user.username}
              </li>
            ))}
            {tournament.entries.length === 0 && (
              <li className="text-sm text-muted-foreground">No one&apos;s marked as in yet.</li>
            )}
          </ul>

          {tournament.status === "SIGNUPS" && (
            <div className="mt-4 flex flex-wrap gap-2">
              {userId && !myEntry && (
                <form action={joinTournamentAction.bind(null, id)}>
                  <Button type="submit" size="sm">
                    I&apos;m in
                  </Button>
                </form>
              )}
              {userId && myEntry && (
                <form action={leaveTournamentAction.bind(null, id)}>
                  <Button type="submit" variant="outline" size="sm">
                    Leave
                  </Button>
                </form>
              )}
            </div>
          )}

          {isHostOrMod && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              {tournament.status === "SIGNUPS" && (
                <form action={markInProgressAction.bind(null, id)}>
                  <Button type="submit" variant="secondary" size="sm">
                    Mark in progress
                  </Button>
                </form>
              )}
              {tournament.status === "IN_PROGRESS" && (
                <form action={markCompletedAction.bind(null, id)}>
                  <Button type="submit" variant="secondary" size="sm">
                    Mark completed
                  </Button>
                </form>
              )}
              {tournament.status !== "CANCELLED" && tournament.status !== "COMPLETED" && (
                <form action={cancelTournamentAction.bind(null, id)}>
                  <Button type="submit" variant="destructive" size="sm">
                    Cancel
                  </Button>
                </form>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

// Enrichment only: falls back to nothing if the token is unset, the URL isn't
// a single event, or the start.gg API call fails — the bracket link above
// always renders regardless.
async function StartggEventInfo({ startggUrl }: { startggUrl: string }) {
  const info = await fetchStartggEventInfo(startggUrl);
  if (!info) return null;

  return (
    <Card className="mt-4">
      <CardContent className="pt-4">
        <p className="text-sm font-medium">
          {info.eventName} · {info.numEntrants ?? "?"} entrants on start.gg
        </p>
        {info.isCompleted && info.standings.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
            {info.standings.map((s) => (
              <li key={s.placement}>
                #{s.placement} — {s.entrantName}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function StartggForm({ tournamentId }: { tournamentId: string }) {
  async function action(formData: FormData) {
    "use server";
    await setStartggUrlAction(tournamentId, String(formData.get("startggUrl") ?? ""));
  }

  return (
    <form action={action} className="flex items-end gap-2">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        start.gg link
        <input
          name="startggUrl"
          type="url"
          required
          placeholder="https://start.gg/tournament/..."
          className="h-8 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      <Button type="submit" size="sm">
        Save
      </Button>
    </form>
  );
}
