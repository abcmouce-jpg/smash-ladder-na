/**
 * Japanese glyphs for a link-preview image, fetched for the exact text being
 * drawn.
 *
 * `next/og` ships Geist and nothing else, so anything outside Latin renders as
 * blank boxes. The site card solves that with a checked-in subset, because its
 * wording is fixed (see public/fonts/README.md) — a player's card can't,
 * because the text includes their username, which is whatever they typed.
 *
 * A full Japanese face is several megabytes against ImageResponse's 500 KB
 * budget for the whole bundle, and a kana-plus-common-kanji subset is both
 * near that ceiling and still wrong for the names it misses. So this asks
 * Google Fonts for a subset of precisely the characters this one card needs —
 * usually a few kilobytes. Google serves TrueType rather than woff2 to an old
 * user agent, which is what next/og accepts.
 *
 * Failure is not fatal: a card with Latin fallback boxes is worse than one
 * with Japanese, and far better than no card at all, so every error path
 * returns undefined and the image renders without the font.
 */

export type OgFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
};

const FAMILY = "Noto Sans JP";
const WEIGHTS = [400, 700] as const;
// Long enough for a cold Google response, short enough that a hung request
// doesn't hold an image render open.
const FETCH_TIMEOUT_MS = 4000;

// Per-process, so repeated renders on one warm instance don't refetch. Keyed
// on the glyph set, so two players whose names share characters share an
// entry. Bounded because a long-lived instance would otherwise accumulate one
// entry per distinct username it has drawn.
const MAX_CACHED = 64;
const cache = new Map<string, OgFont[] | undefined>();

/** The characters Geist can't draw, deduped and ordered so the key is stable. */
function japaneseGlyphs(text: string): string {
  const needed = new Set<string>();
  for (const ch of text) {
    // Everything above Latin Extended-B — kana, kanji, full-width punctuation
    // — is outside what the bundled face covers.
    if (ch.codePointAt(0)! > 0x024f) needed.add(ch);
  }
  return [...needed].sort().join("");
}

async function fetchSubset(glyphs: string, weight: 400 | 700): Promise<OgFont | null> {
  const url =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(FAMILY)}:wght@${weight}` +
    `&text=${encodeURIComponent(glyphs)}`;
  // The old user agent is what makes Google answer with TrueType instead of
  // woff2, which ImageResponse does not accept.
  const css = await fetch(url, {
    headers: { "User-Agent": "Mozilla/4.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!css.ok) return null;
  const href = (await css.text()).match(/src:\s*url\((https:\/\/[^)]+)\)/)?.[1];
  if (!href) return null;

  const font = await fetch(href, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!font.ok) return null;
  return { name: FAMILY, data: await font.arrayBuffer(), weight, style: "normal" };
}

/**
 * Fonts covering whatever in `text` the bundled face can't draw, or undefined
 * when there's nothing it can't — an all-Latin card needs no fetch at all.
 */
export async function japaneseOgFonts(text: string): Promise<OgFont[] | undefined> {
  const glyphs = japaneseGlyphs(text);
  if (!glyphs) return undefined;
  if (cache.has(glyphs)) return cache.get(glyphs);

  let fonts: OgFont[] | undefined;
  try {
    const loaded = await Promise.all(WEIGHTS.map((w) => fetchSubset(glyphs, w)));
    // Partial coverage would draw one weight and box the other, which looks
    // like a bug rather than a fallback — take both or neither.
    fonts = loaded.every((f) => f !== null) ? (loaded as OgFont[]) : undefined;
  } catch {
    fonts = undefined;
  }

  if (cache.size >= MAX_CACHED) cache.clear();
  cache.set(glyphs, fonts);
  return fonts;
}
