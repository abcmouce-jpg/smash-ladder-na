import Link from "next/link";
import { Trophy } from "lucide-react";
import { auth } from "@/auth";
import { listTournaments } from "@/lib/tournaments";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AdSlot } from "@/components/ad-slot";
import { CreateTournamentForm } from "@/components/create-tournament-form";
import { getLang } from "@/lib/i18n";

const STATUS_VARIANT = {
  SIGNUPS: "outline",
  IN_PROGRESS: "secondary",
  COMPLETED: "success",
  CANCELLED: "destructive",
} as const;

const STATUS_LABEL_ES: Record<string, string> = {
  SIGNUPS: "inscripciones",
  IN_PROGRESS: "en curso",
  COMPLETED: "completado",
  CANCELLED: "cancelado",
};

export default async function TournamentsPage() {
  const session = await auth();
  const [tournaments, lang] = await Promise.all([listTournaments(), getLang()]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">{lang === "es" ? "Torneos" : "Tournaments"}</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {lang === "es"
          ? "Eventos casuales de la comunidad que no afectan la clasificación — doble eliminación en start.gg por convención."
          : "Casual, unrated community events — double elimination on start.gg by convention."}
      </p>

      {session?.user?.id && (
        <Card className="mt-8">
          <CardContent className="pt-4">
            <CreateTournamentForm lang={lang} />
          </CardContent>
        </Card>
      )}

      <div className="mt-10 flex flex-col gap-3">
        {tournaments.map((t) => (
          <Link key={t.id} href={`/tournaments/${t.id}`}>
            <Card className="transition-colors hover:border-foreground/30">
              <CardContent className="flex items-center justify-between pt-4">
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {lang === "es" ? "Organizado por" : "Hosted by"} {t.host.username} · {t._count.entries}{" "}
                    {lang === "es"
                      ? t._count.entries === 1
                        ? "participante"
                        : "participantes"
                      : t._count.entries === 1
                        ? "entrant"
                        : "entrants"}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[t.status]}>
                  {lang === "es" ? STATUS_LABEL_ES[t.status] : t.status.toLowerCase()}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {tournaments.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {lang === "es" ? "Aún no hay torneos — organiza uno arriba." : "No tournaments yet — host one above."}
          </p>
        )}
      </div>

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_TOURNAMENTS} />
    </main>
  );
}
