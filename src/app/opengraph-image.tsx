import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";
import { DEFAULT_LANG, SITE_NAME, instanceText } from "@/lib/site";
import { siteOrigin } from "@/lib/site-url";

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

// The card is the first thing anyone sees of the site — it's what Discord, X
// and Google draw when the link is pasted — so it is written per instance
// rather than translated. The Japanese one is deliberately short: this was a
// line-for-line rendering of the English card, and a Japanese headline broken
// mid-phrase at 「〜の」 with its subtitle strung together by interpuncts reads
// as what it was, an English layout with Japanese poured into it.
//
// instanceText rather than tr(): metadata routes have no request to read a
// language from, and don't need one. The card is a property of the site.
const WORDMARK = SITE_NAME.toUpperCase();
const HEADLINE = instanceText({
  en: ["Ranked ladder for", "NA Smash Ultimate"],
  es: ["Clasificatoria para", "Smash Ultimate"],
  ja: ["スマブラSP レート対戦"],
});
// Japan shows the address instead of a sales line, which is the convention its
// own scene's sites follow. Read from siteOrigin() so a custom domain lands
// here the moment it is configured, rather than going stale in a string.
const SUBLINE = instanceText({
  en: "Free · Sign in with Discord · Queue up and play",
  es: "Gratis · Entra con Discord · Ponte en cola y juega",
  ja: siteOrigin().replace(/^https?:\/\//, ""),
});

// next/og bundles Geist and nothing else, so Japanese would come out as blank
// boxes. This is Zen Kaku Gothic New cut down to exactly the characters the
// headline draws — under 4 KB, against ImageResponse's 500 KB budget for the
// whole bundle. Only the headline needs it; the wordmark and the address are
// Latin, which Geist already has. See public/fonts/README.md before changing
// any wording above.
const JAPANESE_FONTS =
  DEFAULT_LANG === "ja"
    ? ([
        {
          name: "Zen Kaku Gothic New",
          data: readFileSync(join(process.cwd(), "public", "fonts", "zen-kaku-gothic-new-og-900.ttf")),
          weight: 900,
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
      {HEADLINE.map((line, i) => (
        <div
          key={line}
          style={{
            display: "flex",
            // One Japanese line of this length needs the room two English
            // lines don't.
            fontSize: JAPANESE_FONTS ? 84 : 92,
            fontWeight: JAPANESE_FONTS ? 900 : 700,
            color: "#f5f4f2",
            // Japanese is already tightly set; the negative tracking that suits
            // the Latin headline closes it up past legibility.
            letterSpacing: JAPANESE_FONTS ? 0 : -3,
            marginTop: i === 0 ? 18 : 0,
            lineHeight: 1.05,
            ...(JAPANESE_FONTS ? { fontFamily: "Zen Kaku Gothic New" } : {}),
          }}
        >
          {line}
        </div>
      ))}
      <div
        style={{
          display: "flex",
          fontSize: 32,
          color: "#9a9a9e",
          marginTop: 28,
        }}
      >
        {SUBLINE}
      </div>
    </div>,
    { ...size, ...(JAPANESE_FONTS ? { fonts: [...JAPANESE_FONTS] } : {}) },
  );
}
