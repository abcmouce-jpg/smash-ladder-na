import Link from "next/link";
import { Users } from "lucide-react";
import { getLang } from "@/lib/i18n";
import { tr } from "@/lib/lang";
import { getRandubsLeaderboard } from "@/lib/leaderboard";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";

// Randitto's own board. Separate from /leaderboard rather than a tab on it
// because it ranks a different number: a rating earned on fighters you were
// handed is not comparable with one earned on the fighter you chose, and
// showing them in one table invites exactly that comparison.
export default async function RandittoLeaderboardPage() {
  const lang = await getLang();
  const { totalCount, players } = await getRandubsLeaderboard();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Users className="size-5" />
        {tr(lang, { en: "Randubs leaderboard", es: "Clasificación de Randubs" })}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {tr(lang, {
          en: `Its own ladder, rated only on randubs sets — four players split into random teams of two. A team is rated as one and the change goes to both members, so a weaker partner costs you and a stronger one carries you, exactly as doubles does. It never affects your main rating. Appears here from ${LEADERBOARD_MIN_GAMES} sets.`,
          es: `Su propia clasificación, basada solo en partidas de randubs — cuatro jugadores divididos en equipos aleatorios de dos. El equipo se puntúa como uno y el cambio va a ambos, así que un compañero más débil te cuesta y uno más fuerte te lleva, como en dobles. Nunca afecta a tu clasificación principal. Aparece aquí a partir de ${LEADERBOARD_MIN_GAMES} partidas.`,
        })}
      </p>

      {players.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          {tr(lang, {
            en: `Nobody has played ${LEADERBOARD_MIN_GAMES} randubs sets yet.`,
            es: `Nadie ha jugado ${LEADERBOARD_MIN_GAMES} partidas de randubs todavía.`,
          })}{" "}
          <Link href="/lobby" className="underline hover:no-underline">
            {tr(lang, { en: "Queue for one", es: "Entra a la cola" })}
          </Link>
        </p>
      ) : (
        <>
          <div className="mt-8 flex flex-col divide-y divide-border">
            {players.map((player, i) => (
              <div key={player.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex items-center gap-3">
                  <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <Link href={`/players/${player.id}`} className="underline hover:no-underline">
                    {player.username}
                  </Link>
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {Math.round(player.randubsRating)}{" "}
                  <span className="text-xs">
                    {tr(lang, {
                      en: `· ${player.randubsGamesPlayed} sets`,
                      es: `· ${player.randubsGamesPlayed} sets`,
                    })}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground tabular-nums">
            {tr(lang, {
              en: `${totalCount} ranked on randitto`,
              es: `${totalCount} clasificados en randitto`,
            })}
          </p>
        </>
      )}

      <p className="mt-10 text-sm text-muted-foreground">
        <Link href="/leaderboard" className="underline hover:no-underline">
          {tr(lang, { en: "Back to the main leaderboard", es: "Volver a la clasificación principal" })}
        </Link>
      </p>
    </main>
  );
}
