import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { getLang } from "@/lib/i18n";
import { PageHeading } from "@/components/page-heading";
import { SectionTabs } from "@/components/section-tabs";
import { StatsOverviewSection } from "./overview-section";
import { StatsCharactersSection } from "./characters-section";
import { StatsSeasonsSection } from "./seasons-section";
import { SITE_NAME, instanceText } from "@/lib/site";
import { tr } from "@/lib/lang";

export const metadata: Metadata = {
  title: `${instanceText({ en: "Stats", es: "Estadísticas", ja: "統計" })} — ${SITE_NAME}`,
  description: "Ladder activity, season champions, and character meta across the North American Smash ladder.",
};

// Ladder activity, character meta, and season history live under one "Stats"
// roof — formerly two separate top-level pages (/characters and /seasons).
// The ?tab= param drives which section renders, so each is deep-linkable and
// server-rendered.
const VALID_TABS = ["overview", "characters", "seasons"] as const;
type StatsTab = (typeof VALID_TABS)[number];

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sort?: string; dir?: string }>;
}) {
  const { tab: tabParam, sort, dir } = await searchParams;
  const lang = await getLang();
  const tab: StatsTab = VALID_TABS.includes((tabParam ?? "") as StatsTab) ? (tabParam as StatsTab) : "overview";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <PageHeading
        icon={BarChart3}
        title={tr(lang, { en: "Stats", es: "Estadísticas", ja: "統計" })}
        description={tr(lang, {
          en: "Ladder activity, character meta, and season history across the North American ladder.",
          es: "La actividad del ladder, el meta de personajes y el historial de temporadas de Norteamérica.",
          ja: "ラダーの活動状況、キャラクターの流行、シーズンの履歴。",
        })}
      />

      <SectionTabs
        className="mt-8"
        items={[
          {
            href: "?tab=overview",
            label: tr(lang, { en: "Overview", es: "Resumen", ja: "概要" }),
            active: tab === "overview",
          },
          {
            href: "?tab=characters",
            label: tr(lang, { en: "Characters", es: "Personajes", ja: "キャラクター" }),
            active: tab === "characters",
          },
          {
            href: "?tab=seasons",
            label: tr(lang, { en: "Seasons", es: "Temporadas", ja: "シーズン" }),
            active: tab === "seasons",
          },
        ]}
      />

      <div className="mt-6">
        {tab === "overview" && <StatsOverviewSection lang={lang} />}
        {tab === "characters" && <StatsCharactersSection lang={lang} sort={sort} dir={dir} />}
        {tab === "seasons" && <StatsSeasonsSection lang={lang} />}
      </div>
    </main>
  );
}
