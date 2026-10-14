import { prisma } from "@/lib/db";
import { siteOrigin } from "@/lib/site-url";

// Campaign attribution for posts and ads placed off-site. Deliberately a
// separate axis from referrals (lib/referrals.ts): a ?ref= link names a
// player who gets credit, a ?src= link names a *place* a post went up, and
// one visitor can legitimately arrive carrying both (someone shares our
// Reddit post's link onward with their own ref appended).
//
// Kept to ?src= rather than the full utm_* set because the only question we
// actually ask of it is "which post did this player come from" — a single
// tag answers that, and the five-parameter UTM convention exists for
// analytics suites we don't run. The tag is written by hand when a post goes
// up, so the value is whatever campaignLink was called with.

// Cookie-sourced, so client-controlled: a visitor can put anything here.
// Normalized rather than validated against a list — new posts shouldn't need
// a code change to be trackable, and an unrecognized tag is still useful
// data. The cap and charset keep it from being used as a storage channel or
// turning admin views into an injection surface.
export const SIGNUP_SOURCE_MAX_LENGTH = 40;

export function normalizeCampaignTag(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, SIGNUP_SOURCE_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

// Same origin resolution as referralLink — see lib/site-url.ts.
export function campaignLink(tag: string, path = "/") {
  return `${siteOrigin()}${path}?src=${encodeURIComponent(tag)}`;
}

// What each campaign actually produced. Signups alone would flatter a post
// that drew a crowd of people who never played, which is the exact failure
// mode worth measuring — 74% of all signups never play a single set — so
// this reports the funnel rather than a single number.
export async function getCampaignResults() {
  const rows = await prisma.user.groupBy({
    by: ["signupSource"],
    where: { signupSource: { not: null } },
    _count: { signupSource: true },
    orderBy: { _count: { signupSource: "desc" } },
  });

  const played = await prisma.user.groupBy({
    by: ["signupSource"],
    where: { signupSource: { not: null }, gamesPlayed: { gt: 0 } },
    _count: { signupSource: true },
  });
  const established = await prisma.user.groupBy({
    by: ["signupSource"],
    where: { signupSource: { not: null }, gamesPlayed: { gte: 5 } },
    _count: { signupSource: true },
  });

  const playedBySource = new Map(played.map((r) => [r.signupSource, r._count.signupSource]));
  const establishedBySource = new Map(established.map((r) => [r.signupSource, r._count.signupSource]));

  return rows.map((r) => ({
    source: r.signupSource as string,
    signups: r._count.signupSource,
    played: playedBySource.get(r.signupSource) ?? 0,
    reachedFiveSets: establishedBySource.get(r.signupSource) ?? 0,
  }));
}
