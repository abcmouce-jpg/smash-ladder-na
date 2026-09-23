import type { MetadataRoute } from "next";

const SITE_URL = "https://smash-ladder-na.vercel.app";

// Static, high-value pages only — dynamic ones (player profiles, Free
// Battle posts) either require sign-in to mean anything or churn too fast
// (posts expire within 24h) to be worth a crawler's time.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/es`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
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
    { url: `${SITE_URL}/supporters`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
