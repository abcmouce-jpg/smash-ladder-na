import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getOrGenerateCoachingInsight, type PersonalAnalytics } from "@/lib/player-analytics";
import { createTestUser } from "@/test/factories";

vi.mock("@/lib/coaching-insight", () => ({
  generateCoachingInsightText: vi.fn(),
}));

const BASE_STATS: PersonalAnalytics = {
  ratingTrend: [
    { date: new Date("2026-01-01"), rating: 1500 },
    { date: new Date("2026-01-02"), rating: 1520 },
    { date: new Date("2026-01-03"), rating: 1540 },
  ],
  characterWinRates: [{ label: "Fox", wins: 2, losses: 1, total: 3, winRate: 2 / 3 }],
  stageWinRates: [{ label: "Battlefield", wins: 2, losses: 1, total: 3, winRate: 2 / 3 }],
};

describe("getOrGenerateCoachingInsight", () => {
  afterEach(() => {
    // Same reasoning as match-comments.integration.test.ts — a bare vi.fn(),
    // so clearAllMocks (not just restoreAllMocks) to drop call history too.
    vi.clearAllMocks();
  });

  it("generates and caches an insight on first call", async () => {
    const { generateCoachingInsightText } = await import("@/lib/coaching-insight");
    vi.mocked(generateCoachingInsightText).mockResolvedValue("Rating went from 1500 to 1540.");

    const user = await createTestUser();
    const result = await getOrGenerateCoachingInsight(user.id, BASE_STATS);

    expect(result).toBe("Rating went from 1500 to 1540.");
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.aiInsightBody).toBe("Rating went from 1500 to 1540.");
    expect(updated.aiInsightSignature).not.toBeNull();
  });

  it("does not call the AI Gateway again when stats haven't changed", async () => {
    const { generateCoachingInsightText } = await import("@/lib/coaching-insight");
    vi.mocked(generateCoachingInsightText).mockResolvedValue("first");

    const user = await createTestUser();
    await getOrGenerateCoachingInsight(user.id, BASE_STATS);
    const second = await getOrGenerateCoachingInsight(user.id, BASE_STATS);

    expect(generateCoachingInsightText).toHaveBeenCalledTimes(1);
    expect(second).toBe("first");
  });

  it("regenerates when stats change", async () => {
    const { generateCoachingInsightText } = await import("@/lib/coaching-insight");
    vi.mocked(generateCoachingInsightText).mockResolvedValueOnce("first").mockResolvedValueOnce("second");

    const user = await createTestUser();
    await getOrGenerateCoachingInsight(user.id, BASE_STATS);
    const changedStats: PersonalAnalytics = {
      ...BASE_STATS,
      ratingTrend: [...BASE_STATS.ratingTrend, { date: new Date("2026-01-04"), rating: 1560 }],
    };
    const result = await getOrGenerateCoachingInsight(user.id, changedStats);

    expect(generateCoachingInsightText).toHaveBeenCalledTimes(2);
    expect(result).toBe("second");
  });

  it("falls back to the last cached body when generation fails", async () => {
    const { generateCoachingInsightText } = await import("@/lib/coaching-insight");
    vi.mocked(generateCoachingInsightText).mockResolvedValueOnce("cached").mockRejectedValueOnce(new Error("down"));

    const user = await createTestUser();
    await getOrGenerateCoachingInsight(user.id, BASE_STATS);
    const changedStats: PersonalAnalytics = {
      ...BASE_STATS,
      ratingTrend: [...BASE_STATS.ratingTrend, { date: new Date("2026-01-04"), rating: 1560 }],
    };
    const result = await getOrGenerateCoachingInsight(user.id, changedStats);

    expect(result).toBe("cached");
  });

  it("returns null when there's never been a successful generation", async () => {
    const { generateCoachingInsightText } = await import("@/lib/coaching-insight");
    vi.mocked(generateCoachingInsightText).mockRejectedValue(new Error("down"));

    const user = await createTestUser();
    const result = await getOrGenerateCoachingInsight(user.id, BASE_STATS);

    expect(result).toBeNull();
  });
});
