import { describe, it, expect } from "vitest";
import { resolveReferrerId, getReferralCount, getTopRecruiters, referralLink } from "./referrals";
import { createTestUser } from "@/test/factories";

describe("referralLink", () => {
  it("builds a link keyed on the user's id", () => {
    expect(referralLink("abc123")).toBe("https://smash-ladder-na.vercel.app/?ref=abc123");
  });
});

describe("resolveReferrerId", () => {
  it("returns null when there's no cookie value", async () => {
    expect(await resolveReferrerId(undefined)).toBeNull();
    expect(await resolveReferrerId(null)).toBeNull();
  });

  it("returns null for a value that doesn't match a real user — a forged or stale cookie", async () => {
    expect(await resolveReferrerId("not-a-real-user-id")).toBeNull();
  });

  it("resolves a cookie value that matches a real user", async () => {
    const referrer = await createTestUser();
    expect(await resolveReferrerId(referrer.id)).toBe(referrer.id);
  });
});

describe("getReferralCount", () => {
  it("only counts referred users who've actually played a game", async () => {
    const referrer = await createTestUser();
    await createTestUser({ referredById: referrer.id, gamesPlayed: 5 });
    await createTestUser({ referredById: referrer.id, gamesPlayed: 0 }); // signed up, never played
    await createTestUser(); // unrelated user, no referrer

    expect(await getReferralCount(referrer.id)).toBe(1);
  });
});

describe("getTopRecruiters", () => {
  it("ranks referrers by how many of their referrals have played, most first", async () => {
    const topRecruiter = await createTestUser();
    await createTestUser({ referredById: topRecruiter.id, gamesPlayed: 3 });
    await createTestUser({ referredById: topRecruiter.id, gamesPlayed: 1 });

    const secondRecruiter = await createTestUser();
    await createTestUser({ referredById: secondRecruiter.id, gamesPlayed: 2 });

    const results = await getTopRecruiters(10);
    const ids = results.map((r) => r.id);

    expect(ids.indexOf(topRecruiter.id)).toBeLessThan(ids.indexOf(secondRecruiter.id));
    expect(results.find((r) => r.id === topRecruiter.id)?.count).toBe(2);
    expect(results.find((r) => r.id === secondRecruiter.id)?.count).toBe(1);
  });

  it("excludes a recruiter whose referrals never played a game", async () => {
    const recruiter = await createTestUser();
    await createTestUser({ referredById: recruiter.id, gamesPlayed: 0 });

    const results = await getTopRecruiters(10);
    expect(results.map((r) => r.id)).not.toContain(recruiter.id);
  });
});
