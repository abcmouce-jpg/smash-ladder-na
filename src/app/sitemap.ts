import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { siteOrigin } from "@/lib/site-url";
import { PUBLISHES_SPANISH, HAS_KOFI, HAS_COMMUNITY_GUIDES } from "@/lib/site";
import { characterPageTarget, characterSlug, type SmashCharacter } from "@/lib/characters";

// Profiles are deliberately NOT listed. They are templated stat pages — a
// name, a rating and a match table, about 2,400 characters of which ~200 is
// the shared nav — and there were 1,236 of them against 32 pages with prose
// on them, so 97.5% of what this file advertised was the "templated bulk"
// the characterEntries comment below already refuses to submit. AdSense
// refused the site ten times through 2026-10, every message pointing at
// content quantity and quality and none of them at anything else; a sitemap
// that is almost entirely generated pages is the clearest version of that
// complaint we were sending ourselves.
//
// Dropping them costs very little. Measured 2026-11-01 in Search Console:
// profiles took 5 of 96 clicks, against 83 for the home page. And a sitemap
// is an invitation, not a fence — every profile stays linked from the
// leaderboard, stays crawlable, and the ones already indexed stay indexed.
// Restore playerEntries from git history if the trade ever looks wrong.

/**
 * One entry per fighter that someone has actually written about.
 *
 * Not the whole roster: a page for a fighter with no write-ups is its usage
 * numbers and nothing else, and eighty-odd of those is the templated bulk
 * that got this site refused by AdSense in the first place. A character earns
 * a sitemap entry once there is prose on it, and loses nothing by waiting —
 * the page still exists and is still linked from the stats table.
 */
async function characterEntries(siteUrl: string): Promise<MetadataRoute.Sitemap> {
  if (!HAS_COMMUNITY_GUIDES) return [];
  const written = await prisma.characterGuide.findMany({
    where: { hiddenAt: null },
    select: { character: true, updatedAt: true },
  });
  // characterPageTarget is what /characters/[name] serves, so this advertises
  // exactly the URLs that exist: echoes folded into their base, and nothing
  // for "Random" (a queue option, not a fighter — and someone has tagged a
  // guide with it).
  const latestByGroup = new Map<SmashCharacter, Date>();
  for (const guide of written) {
    const group = characterPageTarget(guide.character);
    if (!group) continue;
    const seen = latestByGroup.get(group);
    if (!seen || seen < guide.updatedAt) latestByGroup.set(group, guide.updatedAt);
  }
  return [...latestByGroup].map(([character, lastModified]) => ({
    url: `${siteUrl}/characters/${characterSlug(character)}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.6,
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
    ...(await characterEntries(SITE_URL)),
    { url: `${SITE_URL}/rules`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/rating`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
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
  ];
}
