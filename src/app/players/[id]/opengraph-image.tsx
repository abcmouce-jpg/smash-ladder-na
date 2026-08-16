import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { getRankTier } from "@/lib/rank-tier";
import { getCareerStats } from "@/lib/players";
import { characterIconSlug } from "@/lib/character-icons";

export const alt = "Smash Ladder NA rank card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ICON_URI = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public", "smash_ladder_icon_white.png"),
).toString("base64")}`;

// Matches the root opengraph-image.tsx palette so a player's rank card
// reads as the same brand, not a bolted-on second design. Tier colors are
// separate from RANK_TIERS' Tailwind className strings — ImageResponse
// (Satori) doesn't run Tailwind, so each tier needs its own literal hex.
const TIER_COLORS: Record<string, string> = {
  Legend: "#fb7185",
  Grandmaster: "#facc15",
  Master: "#a78bfa",
  Elite: "#60a5fa",
  Fighter: "#38bdf8",
  Challenger: "#fb923c",
};

function characterIconDataUri(character: string | null): string | null {
  const slug = character ? characterIconSlug(character) : undefined;
  if (!slug) return null;
  try {
    const bytes = readFileSync(join(process.cwd(), "public", "characters", `${slug}.png`));
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

// Doubles as the profile's link-preview image (Discord/X embeds pick this
// up automatically via Next's file convention — no manual <meta> wiring)
// and a stable, directly-fetchable "flex your rank" image URL.
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await prisma.user.findUnique({
    where: { id },
    select: { username: true, avatarUrl: true, rating: true, gamesPlayed: true, mainCharacter: true },
  });

  if (!player) {
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          color: "#9a9a9e",
          fontSize: 40,
        }}
      >
        Smash Ladder NA
      </div>,
      { ...size },
    );
  }

  const [career, tier] = await Promise.all([getCareerStats(id), getRankTier(player.rating, player.gamesPlayed)]);

  const tierColor = tier ? (TIER_COLORS[tier.name] ?? "#ff6e50") : "#6b6b70";
  const characterIcon = characterIconDataUri(player.mainCharacter);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        backgroundColor: "#0a0a0a",
        backgroundImage: `radial-gradient(circle at 82% 20%, ${tierColor}33, rgba(10,10,10,0) 55%)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <img src={ICON_URI} width={36} height={36} style={{ borderRadius: 8 }} alt="" />
        <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: "#9a9a9e", letterSpacing: 1 }}>
          SMASH LADDER NA
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        {player.avatarUrl && (
          <img
            src={player.avatarUrl}
            width={160}
            height={160}
            style={{ borderRadius: "50%", border: `4px solid ${tierColor}` }}
            alt=""
          />
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, color: "#f5f4f2", letterSpacing: -2 }}>
            {player.username}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14 }}>
            <div
              style={{
                display: "flex",
                fontSize: 32,
                fontWeight: 700,
                color: tierColor,
                padding: "6px 20px",
                borderRadius: 999,
                border: `2px solid ${tierColor}`,
              }}
            >
              {tier ? tier.name.toUpperCase() : "PROVISIONAL"}
            </div>
            <div style={{ display: "flex", fontSize: 32, color: "#9a9a9e" }}>{player.rating} rating</div>
            {characterIcon && <img src={characterIcon} width={44} height={44} style={{ borderRadius: 8 }} alt="" />}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 64 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: "#f5f4f2" }}>
            {career.totalWins}-{career.totalLosses}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#6b6b70" }}>LIFETIME RECORD</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: "#f5f4f2" }}>{career.bestWinStreak}</div>
          <div style={{ display: "flex", fontSize: 22, color: "#6b6b70" }}>BEST STREAK</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: "#f5f4f2" }}>
            {career.peakRating ?? "—"}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#6b6b70" }}>PEAK RATING</div>
        </div>
      </div>
    </div>,
    { ...size },
  );
}
