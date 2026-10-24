// Which instance this deployment is. One codebase, two sites: nasmashmate.com
// for North America and a Japanese one stood up on 2026-10-24, the day
// スマメイト (Smashmate) shut down and left the Japanese scene without a ladder.
//
// Everything that differs between them is read from the environment rather
// than branched on in the code, so a third region costs a Vercel project and a
// set of variables, not a pass over the source.
//
// NEXT_PUBLIC_ because the name appears in client components (share text, the
// header) as well as in server-rendered metadata.

import type { Lang } from "@/lib/i18n";

/** Display name of this instance. */
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Smash Ladder NA";

/** One-line description, used in metadata, the manifest and OG images. */
export const SITE_DESCRIPTION =
  process.env.NEXT_PUBLIC_SITE_DESCRIPTION?.trim() ||
  "North American ranked ladder and matchmaking for Smash.";

/**
 * Language a visitor gets before they pick one. getLang() still prefers an
 * explicit cookie and then the signed-in preference; this is only the floor.
 */
export const DEFAULT_LANG: Lang = (() => {
  const v = process.env.NEXT_PUBLIC_DEFAULT_LANG?.trim();
  return v === "ja" || v === "es" ? v : "en";
})();

/**
 * Which set of match regions this instance offers. Matchmaking is distance
 * based, so a Japanese player must never be offered a North American region
 * and the other way round — the pools are separated here rather than by
 * filtering after the fact.
 */
export type RegionSet = "na" | "jp";
export const REGION_SET: RegionSet = process.env.NEXT_PUBLIC_REGION_SET?.trim() === "jp" ? "jp" : "na";

// The custom domain, for links meant to be shared off-site (an X intent,
// a Discord message) where the nicer branded URL matters. layout.tsx,
// robots.ts, and sitemap.ts each still hardcode the vercel.app domain for
// SEO canonicalization — a separate, pre-existing decision this doesn't
// touch.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://nasmashmate.com";
