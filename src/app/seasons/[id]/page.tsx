import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSeasonStandings } from "@/lib/seasons";
import { Card } from "@/components/ui/card";
import { getLang } from "@/lib/i18n";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function SeasonStandingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const season = await prisma.season.findUnique({ where: { id } });
  if (!season) notFound();

  const [standings, lang] = await Promise.all([getSeasonStandings(id), getLang()]);
  const dateLocale = lang === "es" ? "es-MX" : "en-US";

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">{season.name}</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {season.startsAt.toLocaleDateString(dateLocale)} –{" "}
        {season.endsAt?.toLocaleDateString(dateLocale) ?? (lang === "es" ? "actualidad" : "present")}
      </p>

      <Card className="mt-8 overflow-hidden py-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pl-4 font-medium">#</th>
              <th className="py-2 font-medium">{lang === "es" ? "Jugador" : "Player"}</th>
              <th className="py-2 font-medium text-right tabular-nums">
                {lang === "es" ? "Clasificación final" : "Final rating"}
              </th>
              <th className="py-2 pr-4 font-medium text-right tabular-nums">
                {lang === "es" ? "Partidas" : "Sets"}
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pl-4 tabular-nums text-muted-foreground">
                  {MEDALS[s.rank - 1] ?? s.rank}
                </td>
                <td className="py-2">
                  <Link href={`/players/${s.user.id}`} className="hover:underline">
                    {s.user.username}
                  </Link>
                </td>
                <td className="py-2 text-right font-medium tabular-nums">{s.finalRating}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                  {s.gamesPlayed}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {standings.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            {lang === "es" ? "Nadie jugó rankeado esa temporada." : "No ranked players that season."}
          </p>
        )}
      </Card>
    </main>
  );
}
