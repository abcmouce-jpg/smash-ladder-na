import { ChartLine } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getLang, type Lang } from "@/lib/i18n";
import { getPersonalAnalytics } from "@/lib/player-analytics";
import { isEffectiveGoldSupporter, GOLD_SUPPORTER_MIN_AMOUNT_USD } from "@/lib/supporters";
import { KOFI_URL } from "@/lib/links";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RatingTrendChart } from "@/components/rating-trend-chart";
import { WinRateBars } from "@/components/win-rate-bars";
import { HAS_KOFI, SITE_NAME } from "@/lib/site";
import { tr } from "@/lib/lang";

export const metadata = { title: `Analytics — ${SITE_NAME}` };

export default async function AnalyticsPage() {
  const [session, lang] = await Promise.all([auth(), getLang()]);

  if (!session?.user?.id) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <PageTitle lang={lang} />
        <p className="mt-2 text-sm text-muted-foreground">
          {tr(lang, {
            en: "Sign in with Discord (top right) to view your analytics.",
            es: "Inicia sesión con Discord (arriba a la derecha) para ver tus estadísticas.",
            ja: "右上の Discord でログインすると、自分の統計を見られます。",
          })}
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

  if (HAS_KOFI && !isGold) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <PageTitle lang={lang} />
        <p className="mt-2 text-sm text-muted-foreground">
          {tr(lang, {
            en: `This is Gold-supporter exclusive ($${GOLD_SUPPORTER_MIN_AMOUNT_USD}+ on Ko-fi): your rating trend, and a win-rate breakdown by character and stage.`,
            es: `Esto es exclusivo para colaboradores Gold ($${GOLD_SUPPORTER_MIN_AMOUNT_USD}+ en Ko-fi): tu gráfica de clasificación, y el desglose de victorias por personaje y escenario.`,
            ja: `これはゴールドサポーター限定です（Ko-fi で $${GOLD_SUPPORTER_MIN_AMOUNT_USD} 以上）。レートの推移と、キャラ別・ステージ別の勝率を見られます。`,
          })}
        </p>
        <a href={KOFI_URL} target="_blank" rel="noreferrer" className="mt-4 block w-fit">
          <Button type="button">{tr(lang, { en: "Go to Ko-fi", es: "Ir a Ko-fi", ja: "Ko-fi へ" })}</Button>
        </a>
      </main>
    );
  }

  const { ratingTrend, characterWinRates, stageWinRates } = await getPersonalAnalytics(session.user.id);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <PageTitle lang={lang} />

      <div className="mt-8 flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {tr(lang, { en: "Rating over time", es: "Clasificación a lo largo del tiempo", ja: "レート推移" })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RatingTrendChart data={ratingTrend} lang={lang} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {tr(lang, {
                en: "Win rate by character",
                es: "Porcentaje de victorias por personaje",
                ja: "キャラ別の勝率",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WinRateBars
              rows={characterWinRates}
              lang={lang}
              emptyMessage={tr(lang, {
                en: "No confirmed matches yet.",
                es: "Todavía no hay partidas confirmadas.",
                ja: "確定した試合がまだありません。",
              })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {tr(lang, {
                en: "Win rate by stage",
                es: "Porcentaje de victorias por escenario",
                ja: "ステージ別の勝率",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WinRateBars
              rows={stageWinRates}
              lang={lang}
              emptyMessage={tr(lang, {
                en: "No confirmed matches yet.",
                es: "Todavía no hay partidas confirmadas.",
                ja: "確定した試合がまだありません。",
              })}
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
        {tr(lang, { en: "🏆 Analytics", es: "🏆 Análisis", ja: "🏆 統計" })}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {HAS_KOFI
          ? tr(lang, {
              en: "Gold supporter exclusive.",
              es: "Exclusivo para colaboradores Gold.",
              ja: "ゴールドサポーター限定",
            })
          : tr(lang, {
              en: "Your rating trend, and your win rate by character and stage.",
              es: "Tu clasificación en el tiempo, y tu porcentaje de victorias por personaje y escenario.",
              ja: "レートの推移と、キャラ別・ステージ別の勝率。",
            })}
      </p>
    </>
  );
}
