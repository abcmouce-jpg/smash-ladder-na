import Link from "next/link";
import { Trophy } from "lucide-react";
import { getActiveSeason, listPastSeasons } from "@/lib/seasons";
import { Card } from "@/components/ui/card";
import { getLang } from "@/lib/i18n";

// Public index for /seasons/[id] — that standings page has existed for a
// while but was only ever linked from /admin/seasons, so a champion's
// result was invisible to anyone who didn't already have the URL. This is
// the missing front door, plus where past champions stay discoverable
// after their own rating resets to 1500 next season.
export default async function SeasonsIndexPage() {
  const [active, past, lang] = await Promise.all([getActiveSeason(), listPastSeasons(), getLang()]);
  const dateLocale = lang === "es" ? "es-MX" : "en-US";

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">{lang === "es" ? "Temporadas" : "Seasons"}</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {lang === "es"
          ? "El historial de campeones de la escalera — se conserva aunque la clasificación se reinicie."
          : "The ladder's champion history — kept around even after ratings reset."}
      </p>

      {active && (
        <Card className="mt-6 p-4">
          <p className="text-sm font-medium">{active.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lang === "es" ? "En curso desde " : "In progress since "}
            {active.startsAt.toLocaleDateString(dateLocale)}
          </p>
        </Card>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {past.map((season) => (
          <Link
            key={season.id}
            href={`/seasons/${season.id}`}
            className="flex items-center justify-between rounded-lg border border-border p-4 text-sm hover:bg-accent"
          >
            <span className="font-medium">{season.name}</span>
            <span className="text-xs text-muted-foreground">
              {season.startsAt.toLocaleDateString(dateLocale)} –{" "}
              {season.endsAt?.toLocaleDateString(dateLocale)}
            </span>
          </Link>
        ))}
        {past.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {lang === "es"
              ? "Todavía no ha terminado ninguna temporada — vuelve cuando esta termine."
              : "No seasons have ended yet — check back once this one wraps up."}
          </p>
        )}
      </div>
    </main>
  );
}
