import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSeasonStandings } from "@/lib/seasons";
import { getCharacterUsage } from "@/lib/players";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CharacterUsageIcons } from "@/components/character-usage-icons";
import { RankBadge } from "@/components/rank-badge";
import { formatRating } from "@/lib/rating-format";
import { getLang, type Lang } from "@/lib/i18n";

const MEDALS = ["🥇", "🥈", "🥉"];
// A season's standings can run long (the preseason snapshots everyone who
// cleared the games-played floor), so the table pages through them at the
// same size as the leaderboard's.
const PAGE_SIZE = 50;

export default async function SeasonStandingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const season = await prisma.season.findUnique({ where: { id } });
  if (!season) notFound();

  const requestedPage = Number(pageParam);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [{ standings, totalCount }, lang] = await Promise.all([
    getSeasonStandings(id, { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    getLang(),
  ]);
  const dateLocale = lang === "es" ? "es-MX" : "en-US";
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Live/all-time usage, same as the leaderboard's — this season's standings
  // don't have their own season-scoped character breakdown, so this is a
  // player's overall main(s) rather than specifically what they played that
  // season.
  const usageByPlayerId = new Map(
    await Promise.all(standings.map(async (s) => [s.user.id, await getCharacterUsage(s.user.id)] as const)),
  );

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

      {totalCount > 0 && (
        <PaginationBar id={id} page={page} totalPages={totalPages} totalCount={totalCount} lang={lang} />
      )}

      <Card className="mt-4 overflow-hidden py-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pl-4 font-medium">#</th>
              <th className="py-2 font-medium">{lang === "es" ? "Jugador" : "Player"}</th>
              <th className="py-2 font-medium">{lang === "es" ? "Rango" : "Tier"}</th>
              <th className="py-2 font-medium text-right tabular-nums">
                {lang === "es" ? "Clasificación final" : "Final rating"}
              </th>
              <th className="py-2 pr-4 font-medium text-right tabular-nums">{lang === "es" ? "Partidas" : "Sets"}</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pl-4 tabular-nums text-muted-foreground">{MEDALS[s.rank - 1] ?? s.rank}</td>
                <td className="py-2">
                  <Link href={`/players/${s.user.id}`} className="flex items-center gap-2 hover:underline">
                    {s.user.username}
                    <CharacterUsageIcons usage={usageByPlayerId.get(s.user.id) ?? []} />
                  </Link>
                </td>
                <td className="py-2">
                  <RankBadge rating={s.finalRating} gamesPlayed={s.gamesPlayed} />
                </td>
                <td className="py-2 text-right font-medium tabular-nums">{formatRating(s.finalRating)}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{s.gamesPlayed}</td>
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

function PaginationBar({
  id,
  page,
  totalPages,
  totalCount,
  lang,
}: {
  id: string;
  page: number;
  totalPages: number;
  totalCount: number;
  lang: Lang;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
      <Badge variant="outline">
        {lang === "es"
          ? `${totalCount} ${totalCount === 1 ? "jugador rankeado" : "jugadores rankeados"}`
          : `${totalCount} ranked player${totalCount === 1 ? "" : "s"}`}
      </Badge>
      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <PageLink id={id} page={page - 1} disabled={page <= 1}>
            {lang === "es" ? "← Anterior" : "← Previous"}
          </PageLink>
          <span className="text-muted-foreground tabular-nums">
            {lang === "es" ? `Página ${page} de ${totalPages}` : `Page ${page} of ${totalPages}`}
          </span>
          <PageLink id={id} page={page + 1} disabled={page >= totalPages}>
            {lang === "es" ? "Siguiente →" : "Next →"}
          </PageLink>
        </div>
      )}
    </div>
  );
}

function PageLink({
  id,
  page,
  disabled,
  children,
}: {
  id: string;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-muted-foreground/40">{children}</span>;
  }
  return (
    <Link href={`/seasons/${id}?page=${page}`} prefetch={false} className="hover:underline">
      {children}
    </Link>
  );
}
