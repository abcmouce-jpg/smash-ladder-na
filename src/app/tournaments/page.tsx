import Link from "next/link";
import { Trophy } from "lucide-react";
import { auth } from "@/auth";
import { listTournaments } from "@/lib/tournaments";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CreateTournamentForm } from "@/components/create-tournament-form";
import { getLang } from "@/lib/i18n";
import { tr, type Lang } from "@/lib/lang";

const STATUS_VARIANT = {
  SIGNUPS: "outline",
  IN_PROGRESS: "secondary",
  COMPLETED: "success",
  CANCELLED: "destructive",
} as const;

// English reads the enum straight off the row, lowercased; the other
// languages need a table, so they get one each.
const STATUS_LABELS: Record<Lang, Record<string, string> | null> = {
  en: null,
  es: { SIGNUPS: "inscripciones", IN_PROGRESS: "en curso", COMPLETED: "completado", CANCELLED: "cancelado" },
  ja: { SIGNUPS: "受付中", IN_PROGRESS: "進行中", COMPLETED: "終了", CANCELLED: "中止" },
};

export function tournamentStatusLabel(status: string, lang: Lang): string {
  return STATUS_LABELS[lang]?.[status] ?? status.toLowerCase();
}

export default async function TournamentsPage() {
  const session = await auth();
  const [tournaments, lang] = await Promise.all([listTournaments(), getLang()]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">
          {tr(lang, { en: "Tournaments", es: "Torneos", ja: "大会" })}
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {tr(lang, {
          en: "Casual, unrated community events — double elimination on start.gg by convention.",
          es: "Eventos casuales de la comunidad que no afectan la clasificación — doble eliminación en start.gg por convención.",
          ja: "レートのかからない、気軽なコミュニティ大会です。慣例として start.gg のダブルイリミネーションで行います。",
        })}
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
                    {tr(lang, { en: "Hosted by", es: "Organizado por", ja: "主催" })} {t.host.username} ·{" "}
                    {t._count.entries}{" "}
                    {tr(lang, {
                      en: t._count.entries === 1 ? "entrant" : "entrants",
                      es: t._count.entries === 1 ? "participante" : "participantes",
                      ja: "人参加",
                    })}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[t.status]}>{tournamentStatusLabel(t.status, lang)}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {tournaments.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {tr(lang, {
              en: "No tournaments yet — host one above.",
              es: "Aún no hay torneos — organiza uno arriba.",
              ja: "まだ大会がありません。上から立ててみてください。",
            })}
          </p>
        )}
      </div>
    </main>
  );
}
