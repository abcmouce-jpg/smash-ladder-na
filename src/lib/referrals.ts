import { prisma } from "@/lib/db";

// Where invite links point. Deliberately not a constant baked into the source:
// an invite has to name whichever origin is actually serving the site —
// production, a custom domain, or a preview deployment — and that differs per
// environment. SITE_URL is the explicit override; otherwise Vercel's own
// VERCEL_PROJECT_PRODUCTION_URL covers deployed environments with no extra
// configuration, and localhost stands in for dev. Resolved per call rather
// than cached at module load so a process (or a test) sees the environment
// it's actually running with.
function siteOrigin(): string {
  const configured = process.env.SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelDomain) return `https://${vercelDomain.replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}

export function referralLink(userId: string) {
  return `${siteOrigin()}/?ref=${userId}`;
}

// Validates a ref cookie's value before it's trusted as a real referrer —
// the cookie is client-controlled, so this can't just assume it names a
// real account. Self-referral (someone's own cookie somehow matching their
// own new account) isn't checked here since it can't actually happen: the
// cookie is set from an existing user's id, read at signup time for a
// brand-new account that doesn't have an id yet to collide with.
export async function resolveReferrerId(refCookieValue: string | undefined | null): Promise<string | null> {
  if (!refCookieValue) return null;
  const referrer = await prisma.user.findUnique({ where: { id: refCookieValue }, select: { id: true } });
  return referrer?.id ?? null;
}

// Only counts referred signups with 1+ games played — same reasoning as
// getTopRecruiters below, and matches what the settings page's "X people
// you invited have started playing" line actually claims.
export async function getReferralCount(userId: string): Promise<number> {
  return prisma.user.count({ where: { referredById: userId, gamesPlayed: { gt: 0 } } });
}

// Top of the ladder's growth loop — a leaderboard of who's brought in the
// most new players, same "make status visible" logic as the rank tiers and
// rank card. Only counts referrals with 1+ games played: a raw signup count
// would reward someone for links that just bounce, not actual new players.
export async function getTopRecruiters(limit = 10) {
  const rows = await prisma.user.groupBy({
    by: ["referredById"],
    where: { referredById: { not: null }, gamesPlayed: { gt: 0 } },
    _count: { referredById: true },
    orderBy: { _count: { referredById: "desc" } },
    take: limit,
  });

  const referrerIds = rows.map((r) => r.referredById).filter((id): id is string => id !== null);
  const referrers = await prisma.user.findMany({
    where: { id: { in: referrerIds } },
    select: { id: true, username: true, avatarUrl: true },
  });
  const byId = new Map(referrers.map((r) => [r.id, r]));

  return rows
    .map((r) => {
      const referrer = r.referredById ? byId.get(r.referredById) : undefined;
      if (!referrer) return null;
      return { ...referrer, count: r._count.referredById };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}
