import { ChartLine } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getLang, type Lang } from "@/lib/i18n";
import { getPersonalAnalytics, getOrGenerateCoachingInsight } from "@/lib/player-analytics";
import { isEffectiveGoldSupporter, GOLD_SUPPORTER_MIN_AMOUNT_USD } from "@/lib/supporters";
import { KOFI_URL } from "@/lib/links";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RatingTrendChart } from "@/components/rating-trend-chart";
import { WinRateBars } from "@/components/win-rate-bars";

export const metadata = { title: "Analytics — Smash Ladder NA" };

export default async function AnalyticsPage() {
  const [session, lang] = await Promise.all([auth(), getLang()]);

  if (!session?.user?.id) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <PageTitle lang={lang} />
        <p className="mt-2 text-sm text-muted-foreground">
          {lang === "es"
            ? "Inicia sesión con Discord (arriba a la derecha) para ver tus estadísticas."
            : "Sign in with Discord (top right) to view your analytics."}
        </p>
      </main>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSupporter: true, isGoldSupporter: true, supporterExpiresAt: true },
  });
  const isGold = isEffectiveGoldSupporter({
    isSupporter: user?.isSupporter ?? false,
    isGoldSupporter: user?.isGoldSupporter ?? false,
    supporterExpiresAt: user?.supporterExpiresAt ?? null,
  });

  if (!isGold) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <PageTitle lang={lang} />
        <p className="mt-2 text-sm text-muted-foreground">
          {lang === "es"
            ? `Esto es exclusivo para colaboradores Gold ($${GOLD_SUPPORTER_MIN_AMOUNT_USD}+ en Ko-fi): tu gráfica de clasificación, y el desglose de victorias por personaje y escenario.`
            : `This is Gold-supporter exclusive ($${GOLD_SUPPORTER_MIN_AMOUNT_USD}+ on Ko-fi): your rating trend, and a win-rate breakdown by character and stage.`}
        </p>
        <a href={KOFI_URL} target="_blank" rel="noreferrer" className="mt-4 block w-fit">
          <Button type="button">{lang === "es" ? "Ir a Ko-fi" : "Go to Ko-fi"}</Button>
        </a>
      </main>
    );
  }

  const analytics = await getPersonalAnalytics(session.user.id);
  const { ratingTrend, characterWinRates, stageWinRates } = analytics;

  // Skip the AI call entirely below a minimum sample — there's nothing
  // factual to restate from 1-2 games, and the prompt's "note the sample is
  // small" allowance isn't a substitute for just not generating anything.
  const MIN_GAMES_FOR_INSIGHT = 3;
  const insight =
    ratingTrend.length >= MIN_GAMES_FOR_INSIGHT ? await getOrGenerateCoachingInsight(session.user.id, analytics) : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <PageTitle lang={lang} />

      <div className="mt-8 flex flex-col gap-6">
        {insight && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{lang === "es" ? "Resumen (IA)" : "Summary (AI-generated)"}</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{insight}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {lang === "es"
                  ? "Generado a partir de los números de abajo — solo cifras exactas, sin interpretación ni consejos."
                  : "Generated from the numbers below — exact figures only, no interpretation or advice."}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{lang === "es" ? "Clasificación a lo largo del tiempo" : "Rating over time"}</CardTitle>
          </CardHeader>
          <CardContent>
            <RatingTrendChart data={ratingTrend} lang={lang} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{lang === "es" ? "Porcentaje de victorias por personaje" : "Win rate by character"}</CardTitle>
          </CardHeader>
          <CardContent>
            <WinRateBars
              rows={characterWinRates}
              lang={lang}
              emptyMessage={lang === "es" ? "Todavía no hay partidas confirmadas." : "No confirmed matches yet."}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{lang === "es" ? "Porcentaje de victorias por escenario" : "Win rate by stage"}</CardTitle>
          </CardHeader>
          <CardContent>
            <WinRateBars
              rows={stageWinRates}
              lang={lang}
              emptyMessage={lang === "es" ? "Todavía no hay partidas confirmadas." : "No confirmed matches yet."}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function PageTitle({ lang }: { lang: Lang }) {
  return (
    <>
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <ChartLine className="size-6 text-primary" />
        {lang === "es" ? "🏆 Análisis" : "🏆 Analytics"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {lang === "es" ? "Exclusivo para colaboradores Gold." : "Gold supporter exclusive."}
      </p>
    </>
  );
}
