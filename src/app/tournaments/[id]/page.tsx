import Image from "next/image";
import { notFound } from "next/navigation";
import { ExternalLink, Trophy } from "lucide-react";
import { auth } from "@/auth";
import { getTournament } from "@/lib/tournaments";
import { fetchStartggEventInfo } from "@/lib/startgg";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StartggUrlForm } from "@/components/startgg-url-form";
import {
  cancelTournamentAction,
  joinTournamentAction,
  leaveTournamentAction,
  markCompletedAction,
  markInProgressAction,
  setStartggUrlAction,
} from "../actions";
import { getLang, type Lang } from "@/lib/i18n";

const STATUS_LABEL_ES: Record<string, string> = {
  SIGNUPS: "inscripciones",
  IN_PROGRESS: "en curso",
  COMPLETED: "completado",
  CANCELLED: "cancelado",
};

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, tournament, lang] = await Promise.all([auth(), getTournament(id), getLang()]);
  if (!tournament) notFound();

  const userId = session?.user?.id;
  const role = session?.user?.role;
  const isHostOrMod = userId === tournament.hostId || role === "MOD" || role === "ADMIN";
  const myEntry = tournament.entries.find((e) => e.userId === userId);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">{tournament.name}</h1>
        <Badge variant="outline">
          {lang === "es" ? STATUS_LABEL_ES[tournament.status] : tournament.status.toLowerCase()}
        </Badge>
      </div>
      {tournament.description && (
        <p className="mt-2 text-sm text-muted-foreground">{tournament.description}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {lang === "es" ? (
          <>Organizado por {tournament.host.username} · Doble eliminación en start.gg</>
        ) : (
          <>Hosted by {tournament.host.username} · Double elimination on start.gg</>
        )}
      </p>

      {tournament.startggUrl ? (
        <>
          <a href={tournament.startggUrl} target="_blank" rel="noopener noreferrer" className="mt-4 block">
            <Button type="button" className="gap-1.5">
              {lang === "es" ? "Ver bracket en start.gg" : "View bracket on start.gg"}
              <ExternalLink className="size-3.5" />
            </Button>
          </a>
          <StartggEventInfo startggUrl={tournament.startggUrl} lang={lang} />
        </>
      ) : (
        isHostOrMod && (
          <Card className="mt-4">
            <CardContent className="pt-4">
              <StartggForm tournamentId={id} lang={lang} />
            </CardContent>
          </Card>
        )
      )}

      <Card className="mt-6">
        <CardContent className="pt-4">
          <p className="text-sm font-medium">
            {lang === "es" ? "Participantes del ladder" : "Entrants from the ladder"} (
            {tournament.entries.length})
          </p>
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
              <li className="text-sm text-muted-foreground">
                {lang === "es" ? "Nadie se ha marcado como participante aún." : "No one's marked as in yet."}
              </li>
            )}
          </ul>

          {tournament.status === "SIGNUPS" && (
            <div className="mt-4 flex flex-wrap gap-2">
              {userId && !myEntry && (
                <form action={joinTournamentAction.bind(null, id)}>
                  <Button type="submit" size="sm">
                    {lang === "es" ? "Voy" : "I'm in"}
                  </Button>
                </form>
              )}
              {userId && myEntry && (
                <form action={leaveTournamentAction.bind(null, id)}>
                  <Button type="submit" variant="outline" size="sm">
                    {lang === "es" ? "Salir" : "Leave"}
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
                    {lang === "es" ? "Marcar en curso" : "Mark in progress"}
                  </Button>
                </form>
              )}
              {tournament.status === "IN_PROGRESS" && (
                <form action={markCompletedAction.bind(null, id)}>
                  <Button type="submit" variant="secondary" size="sm">
                    {lang === "es" ? "Marcar completado" : "Mark completed"}
                  </Button>
                </form>
              )}
              {tournament.status !== "CANCELLED" && tournament.status !== "COMPLETED" && (
                <form action={cancelTournamentAction.bind(null, id)}>
                  <Button type="submit" variant="destructive" size="sm">
                    {lang === "es" ? "Cancelar" : "Cancel"}
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
async function StartggEventInfo({ startggUrl, lang }: { startggUrl: string; lang: Lang }) {
  const info = await fetchStartggEventInfo(startggUrl);
  if (!info) return null;

  return (
    <Card className="mt-4">
      <CardContent className="pt-4">
        <p className="text-sm font-medium">
          {info.eventName} · {info.numEntrants ?? "?"}{" "}
          {lang === "es" ? "participantes en start.gg" : "entrants on start.gg"}
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

function StartggForm({ tournamentId, lang }: { tournamentId: string; lang: Lang }) {
  return (
    <StartggUrlForm
      action={setStartggUrlAction.bind(null, tournamentId)}
      defaultValue=""
      label={lang === "es" ? "Enlace de start.gg" : "start.gg link"}
      required
      placeholder="https://start.gg/tournament/..."
      saveLabel={lang === "es" ? "Guardar" : "Save"}
    />
  );
}
