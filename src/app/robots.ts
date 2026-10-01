import type { MetadataRoute } from "next";

const SITE_URL = "https://smash-ladder-na.vercel.app";

// SEO-tool crawlers (backlink/rank checkers, not search engines — indexing
// here buys them nothing we get anything back from) found hammering
// /players/[id] at Vercel-bill-noticing volume: AhrefsBot alone accounted
// for a meaningful share of a month's ~31M CDN requests, repeatedly
// re-crawling the same profile pages within seconds of each other. These
// generally do respect robots.txt (unlike a scraper ignoring it outright),
// so a flat disallow is worth it even before/alongside Vercel Firewall's
// Bot Protection rule.
const BLOCKED_CRAWLER_USER_AGENTS = [
  "AhrefsBot",
  "SemrushBot",
  "SiteAuditBot",
  "MJ12bot",
  "DotBot",
  "BLEXBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // No SEO value and/or gated behind sign-in — nothing here is useful
        // for a crawler to index, and /admin doubles as noise we'd rather
        // not advertise the existence of.
        disallow: ["/admin", "/api/", "/settings"],
      },
      ...BLOCKED_CRAWLER_USER_AGENTS.map((userAgent) => ({ userAgent, disallow: "/" })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
