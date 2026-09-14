import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CharacterIcon } from "@/components/character-icon";
import { winRateVariant } from "@/components/character-usage-card";
import { SectionHeading } from "./profile-sections";
import { getCharacterMatchups } from "@/lib/profile-stats";
import { formatUsagePercent } from "@/lib/character-usage-display";
import type { CharacterUsage } from "@/lib/players";
import type { Lang } from "@/lib/i18n";

function gamesLabel(count: number, lang: Lang) {
  if (lang === "es") return count === 1 ? "partida" : "partidas";
  return count === 1 ? "game" : "games";
}

// Per-character matchup breakdowns. The character list on the left is the
// player's usage (getCharacterUsage, shared with the overview tab's usage
// card and header icons); the detail pane on the right comes from
// getCharacterMatchups. Both use raw DB character names, so a character
// stays selected across the two views without any echo grouping.
export async function ProfileCharactersSection({
  id,
  mainCharacter,
  usage,
  charParam,
  lang,
}: {
  id: string;
  mainCharacter: string | null;
  usage: CharacterUsage[];
  charParam: string | null | undefined;
  lang: Lang;
}) {
  if (usage.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "es" ? "Aún no hay partidas rankeadas registradas." : "No ranked games recorded yet."}
      </p>
    );
  }

  const characterMatchups = await getCharacterMatchups(id);
  const byCharacter = new Map(characterMatchups.map((c) => [c.character, c]));

  const requestedCharacter = typeof charParam === "string" ? charParam : null;
  const hasRequested = requestedCharacter !== null && usage.some((u) => u.character === requestedCharacter);
  const selected = hasRequested ? requestedCharacter! : usage[0].character;
  const selectedUsage = usage.find((u) => u.character === selected)!;
  const breakdown = byCharacter.get(selected) ?? null;

  return (
    <div className="grid items-start gap-6 sm:grid-cols-[220px_1fr]">
      <nav
        aria-label={lang === "es" ? "Personajes" : "Characters"}
        className="flex flex-col gap-1 sm:max-h-128 sm:overflow-y-auto sm:pr-1"
      >
        {usage.map((u) => {
          const active = u.character === selected;
          return (
            <Link
              key={u.character}
              href={`?tab=characters&char=${encodeURIComponent(u.character)}`}
              prefetch={false}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <CharacterIcon name={u.character} size={24} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{u.character}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {u.games} {gamesLabel(u.games, lang)}
                </span>
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">{formatUsagePercent(u.usagePercent)}</span>
            </Link>
          );
        })}
      </nav>

      <section aria-label={selected}>
        <div className="flex items-center gap-3">
          <CharacterIcon name={selected} size={40} />
          <div className="flex min-w-0 flex-col">
            <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
              <span className="truncate">{selected}</span>
              {selected === mainCharacter && (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  Main
                </Badge>
              )}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">
                {selectedUsage.games} {gamesLabel(selectedUsage.games, lang)}
              </span>
              <span aria-hidden className="text-muted-foreground/40">
                ·
              </span>
              <span className="tabular-nums">
                {selectedUsage.wins}W–{selectedUsage.losses}L
              </span>
              <span aria-hidden className="text-muted-foreground/40">
                ·
              </span>
              <Badge variant={winRateVariant(selectedUsage.winRate)} className="px-1.5 py-0 tabular-nums">
                {selectedUsage.winRate}%
              </Badge>
              <span aria-hidden className="text-muted-foreground/40">
                ·
              </span>
              <span className="tabular-nums">
                {formatUsagePercent(selectedUsage.usagePercent)} {lang === "es" ? "de uso" : "usage"}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-6">
          <SectionHeading>{lang === "es" ? "Enfrentamientos" : "Matchups"}</SectionHeading>
        </div>

        {breakdown && breakdown.matchups.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2.5">
            {breakdown.matchups.map((mu) => {
              const winRate = mu.winRate;
              const playRate = (mu.games / breakdown.games) * 100;
              return (
                <li key={mu.opponentCharacter} className="flex items-center gap-2.5">
                  <CharacterIcon name={mu.opponentCharacter} size={20} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{mu.opponentCharacter}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        x{mu.games} · {formatUsagePercent(Math.round(playRate))}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${(mu.wins / breakdown.games) * 100}%` }}
                        />
                        <div
                          className="h-full bg-destructive"
                          style={{ width: `${(mu.losses / breakdown.games) * 100}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {mu.wins}W–{mu.losses}L
                      </span>
                      <Badge
                        variant={winRateVariant(winRate)}
                        className="w-10 shrink-0 justify-center px-1 py-0 text-[10px] tabular-nums"
                      >
                        {winRate}%
                      </Badge>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {lang === "es" ? "Aún no hay enfrentamientos registrados." : "No recorded matchups yet."}
          </p>
        )}
      </section>
    </div>
  );
}
