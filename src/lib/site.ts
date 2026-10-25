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

import { asLang, type Lang } from "@/lib/lang";

/** Display name of this instance. */
export const SITE_NAME =
  process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Smash Ladder NA";

/** One-line description, used in metadata, the manifest and OG images. */
// The fallback follows the region, so a JP deploy missing this variable
// doesn't describe itself as North American in every search result.
export const SITE_DESCRIPTION =
  process.env.NEXT_PUBLIC_SITE_DESCRIPTION?.trim() ||
  (process.env.NEXT_PUBLIC_REGION_SET?.trim() === "jp"
    ? "日本のスマブラSP向けレート対戦・マッチングサイト。"
    : "North American ranked ladder and matchmaking for Smash.");

/**
 * Language a visitor gets before they pick one. getLang() still prefers an
 * explicit cookie and then the signed-in preference; this is only the floor.
 */
export const DEFAULT_LANG: Lang = (() => {
  const v = process.env.NEXT_PUBLIC_DEFAULT_LANG?.trim();
  return v === "ja" || v === "es" ? v : "en";
})();

/**
 * Reads a stored User.preferredLanguage. null means "never picked one", which
 * is this instance's default — English on the NA site, Japanese on the JP
 * one. Comparing against "es" and falling back to English, as the
 * notification senders used to, would DM every Japanese player in English.
 */
export function langOrDefault(stored: string | null | undefined): Lang {
  return asLang(stored) ?? DEFAULT_LANG;
}

/**
 * Which set of match regions this instance offers. Matchmaking is distance
 * based, so a Japanese player must never be offered a North American region
 * and the other way round — the pools are separated here rather than by
 * filtering after the fact.
 */
export type RegionSet = "na" | "jp";
export const REGION_SET: RegionSet =
  process.env.NEXT_PUBLIC_REGION_SET?.trim() === "jp" ? "jp" : "na";

// The custom domain, for links meant to be shared off-site (an X intent,
// a Discord message) where the nicer branded URL matters. layout.tsx,
// robots.ts, and sitemap.ts each still hardcode the vercel.app domain for
// SEO canonicalization — a separate, pre-existing decision this doesn't
// touch.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://nasmashmate.com";

/**
 * Time zone dates are displayed in. A season ends at one instant worldwide;
 * this is only which clock to show it on, so it follows the instance rather
 * than the viewer's browser (a server-rendered date has no browser to ask).
 */
export const DISPLAY_TIME_ZONE =
  REGION_SET === "jp" ? "Asia/Tokyo" : "America/New_York";

/**
 * Whether this instance runs the cash prize program. North America's is a
 * USD pool split among the season's top 3; Japan has no prize program
 * decided, and offering one there needs the money to come from sponsorship
 * rather than entry fees to stay clear of 賭博罪, so the banner stays off
 * until that call is made. Flip this, not the copy, when it is.
 */
export const HAS_PRIZE_POOL = REGION_SET !== "jp";

/**
 * Which scene this instance serves, as an adjective, for the copy that names
 * it ("a hub for the North American Smash community"). Per language rather
 * than one env string, because the home page says this in whichever language
 * the visitor reads — an English speaker on the Japanese ladder should be
 * told it is the Japanese one, not shown Japanese text or, worse, told it is
 * North American.
 */
export const SCENE_LABEL: Record<Lang, string> =
  REGION_SET === "jp"
    ? { en: "Japanese", es: "japonesa", ja: "日本の" }
    : { en: "North American", es: "norteamericana", ja: "北米の" };

/**
 * Short latin code for the scene, for places that can't take the adjective:
 * the OG images, whose renderer only has a latin font loaded.
 */
export const SCENE_CODE = REGION_SET === "jp" ? "JP" : "NA";

/**
 * SITE_NAME split for the home page's heading, which colours the last word
 * ("Smash Ladder <NA>"). Split rather than hardcoded so the Japanese
 * instance's name highlights its own last word; a one-word name keeps `lead`
 * empty and colours the whole thing.
 */
export const SITE_NAME_PARTS = (() => {
  const at = SITE_NAME.lastIndexOf(" ");
  return at <= 0
    ? { lead: "", accent: SITE_NAME }
    : { lead: SITE_NAME.slice(0, at), accent: SITE_NAME.slice(at + 1) };
})();
