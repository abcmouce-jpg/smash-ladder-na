import type { MetadataRoute } from "next";

const SITE_URL = "https://smash-ladder-na.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // No SEO value and/or gated behind sign-in — nothing here is useful
      // for a crawler to index, and /admin doubles as noise we'd rather
      // not advertise the existence of.
      disallow: ["/admin", "/api/", "/settings"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
