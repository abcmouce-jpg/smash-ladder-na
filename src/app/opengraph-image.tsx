import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";

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
        SMASH LADDER
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 92,
          fontWeight: 700,
          color: "#f5f4f2",
          letterSpacing: -3,
          marginTop: 18,
          lineHeight: 1.05,
        }}
      >
        Ranked ladder for
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 92,
          fontWeight: 700,
          color: "#f5f4f2",
          letterSpacing: -3,
          lineHeight: 1.05,
        }}
      >
        NA Smash Ultimate
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 32,
          color: "#9a9a9e",
          marginTop: 28,
        }}
      >
        Free · Sign in with Discord · Queue up and play
      </div>
    </div>,
    { ...size },
  );
}
