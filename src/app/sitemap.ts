import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { UserStatus } from "@/generated/prisma/enums";
import { siteOrigin } from "@/lib/site-url";
import { PUBLISHES_SPANISH, HAS_KOFI } from "@/lib/site";

// Profiles are the only part of the site with a search-shaped question
// behind it ("who is <player>") — the rest is either a utility page or a
// live view. Gated on the same 5-set floor the leaderboard uses, so a
// profile is only listed once it actually has a record, characters and a
// match history to show; listing every signup would be a pile of near-empty
// pages, which is worse than not listing them at all.
const SITEMAP_MIN_GAMES = 5;

// Recomputed daily rather than per request: the set only changes as players
// cross the 5-set line, and a crawler hitting this shouldn't fan out into a
// full table scan each time.
export const revalidate = 86400;

async function playerEntries(siteUrl: string): Promise<MetadataRoute.Sitemap> {
  const players = await prisma.user.findMany({
    where: { status: UserStatus.ACTIVE, gamesPlayed: { gte: SITEMAP_MIN_GAMES } },
    select: { id: true, updatedAt: true },
    orderBy: { gamesPlayed: "desc" },
  });
  return players.map((p) => ({
    url: `${siteUrl}/players/${p.id}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Resolved per request rather than hardcoded: a sitemap that names a
  // different origin than the one serving it is treated as cross-domain and
  // ignored, which is exactly what happened while this was pinned to the
  // bare vercel.app domain instead of the custom one.
  const SITE_URL = siteOrigin();
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    ...(PUBLISHES_SPANISH
      ? [{ url: `${SITE_URL}/es`, lastModified: now, changeFrequency: "daily" as const, priority: 0.9 }]
      : []),
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/leaderboard`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/stats`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/friendlies`, lastModified: now, changeFrequency: "hourly", priority: 0.5 },
    { url: `${SITE_URL}/tournaments`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/live`, lastModified: now, changeFrequency: "hourly", priority: 0.6 },
    // Worth crawling despite the private-notes half: the Guides tab is public
    // and community-authored, so there's real content behind it signed out.
    { url: `${SITE_URL}/notes`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
    { url: `${SITE_URL}/rules`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    ...(HAS_KOFI
      ? [
          {
            url: `${SITE_URL}/supporters`,
            lastModified: now,
            changeFrequency: "weekly" as const,
            priority: 0.4,
          },
        ]
      : []),
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ...(await playerEntries(SITE_URL)),
  ];
}
