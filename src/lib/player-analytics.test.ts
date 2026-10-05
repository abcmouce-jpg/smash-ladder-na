import { describe, it, expect } from "vitest";
import { buildAnalyticsSignature, type PersonalAnalytics } from "@/lib/player-analytics";

const STATS: PersonalAnalytics = {
  ratingTrend: [
    { date: new Date("2026-01-01"), rating: 1500 },
    { date: new Date("2026-01-02"), rating: 1540 },
  ],
  characterWinRates: [{ label: "Fox", wins: 2, losses: 1, total: 3, winRate: 2 / 3 }],
  stageWinRates: [{ label: "Battlefield", wins: 2, losses: 1, total: 3, winRate: 2 / 3 }],
};

describe("buildAnalyticsSignature", () => {
  it("is stable across calls with identical stats", () => {
    expect(buildAnalyticsSignature(STATS)).toBe(buildAnalyticsSignature(structuredClone(STATS)));
  });

  it("changes when the latest rating changes", () => {
    const changed: PersonalAnalytics = {
      ...STATS,
      ratingTrend: [...STATS.ratingTrend, { date: new Date("2026-01-03"), rating: 1560 }],
    };
    expect(buildAnalyticsSignature(changed)).not.toBe(buildAnalyticsSignature(STATS));
  });

  it("changes when a character win/loss record changes", () => {
    const changed: PersonalAnalytics = {
      ...STATS,
      characterWinRates: [{ label: "Fox", wins: 3, losses: 1, total: 4, winRate: 0.75 }],
    };
    expect(buildAnalyticsSignature(changed)).not.toBe(buildAnalyticsSignature(STATS));
  });

  it("ignores date values — only the count and ratings matter", () => {
    const sameButLaterDates: PersonalAnalytics = {
      ...STATS,
      ratingTrend: STATS.ratingTrend.map((p) => ({ ...p, date: new Date(p.date.getTime() + 1000 * 60 * 60) })),
    };
    expect(buildAnalyticsSignature(sameButLaterDates)).toBe(buildAnalyticsSignature(STATS));
  });
});
