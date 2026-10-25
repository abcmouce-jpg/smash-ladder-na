import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";
import { DEFAULT_LANG, SITE_NAME, instanceText } from "@/lib/site";

// Renders once at build/request time and gets picked up automatically by
// Next.js's file-based metadata convention — no manual <meta> wiring needed,
// and no static image asset to keep in sync with the site's actual palette.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Inlined as a data URI (read once at module load, not per-request) rather
// than fetched by URL — this route has no request object to build an
// absolute URL from, and the file never changes at runtime anyway.
const iconDataUri = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public", "smash_ladder_icon.png"),
).toString("base64")}`;

// The card is the first thing anyone sees of the site — it's what Discord,
// X and Google draw when the link is pasted — and every word of it was the
// North American copy, so the Japanese instance advertised itself as
// "Ranked ladder for NA Smash Ultimate".
//
// instanceText rather than tr(): metadata routes have no request to read a
// language from, and don't need one. The card is a property of the site.
const WORDMARK = SITE_NAME.toUpperCase();
const HEADLINE_TOP = instanceText({
  en: "Ranked ladder for",
  es: "Clasificatoria para",
  ja: "日本のスマブラSPの",
});
const HEADLINE_BOTTOM = instanceText({
  en: "NA Smash Ultimate",
  es: "Smash Ultimate",
  ja: "レート対戦ラダー",
});
const TAGLINE = instanceText({
  en: "Free · Sign in with Discord · Queue up and play",
  es: "Gratis · Entra con Discord · Ponte en cola y juega",
  ja: "無料 · Discord でログイン · すぐ対戦",
});

// next/og bundles Geist and nothing else, so Japanese would come out as blank
// boxes. These are Noto Sans JP cut down to exactly the characters above —
// 15 KB each, against ImageResponse's 500 KB budget for the whole bundle. Only
// read where they're needed; an instance publishing Latin text has Geist.
// See public/fonts/README.md before changing any wording above.
const JAPANESE_FONTS =
  DEFAULT_LANG === "ja"
    ? ([
        {
          name: "Noto Sans JP",
          data: readFileSync(join(process.cwd(), "public", "fonts", "noto-sans-jp-og-400.ttf")),
          weight: 400,
          style: "normal",
        },
        {
          name: "Noto Sans JP",
          data: readFileSync(join(process.cwd(), "public", "fonts", "noto-sans-jp-og-700.ttf")),
          weight: 700,
          style: "normal",
        },
      ] as const)
    : undefined;

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "80px",
        backgroundColor: "#0a0a0a",
        backgroundImage: "radial-gradient(circle at 78% 25%, rgba(255,110,80,0.22), rgba(10,10,10,0) 55%)",
        ...(JAPANESE_FONTS ? { fontFamily: "Noto Sans JP" } : {}),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 30,
          fontWeight: 600,
          color: "#ff6e50",
          letterSpacing: -0.5,
        }}
      >
        <img src={iconDataUri} width={48} height={48} style={{ borderRadius: 10 }} alt="" />
        {WORDMARK}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 92,
          fontWeight: 700,
          color: "#f5f4f2",
          // Japanese is already tightly set; the negative tracking that suits
          // the Latin headline closes it up past legibility.
          letterSpacing: JAPANESE_FONTS ? 0 : -3,
          marginTop: 18,
          lineHeight: 1.05,
        }}
      >
        {HEADLINE_TOP}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 92,
          fontWeight: 700,
          color: "#f5f4f2",
          letterSpacing: JAPANESE_FONTS ? 0 : -3,
          lineHeight: 1.05,
        }}
      >
        {HEADLINE_BOTTOM}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 32,
          color: "#9a9a9e",
          marginTop: 28,
        }}
      >
        {TAGLINE}
      </div>
    </div>,
    { ...size, ...(JAPANESE_FONTS ? { fonts: [...JAPANESE_FONTS] } : {}) },
  );
}
