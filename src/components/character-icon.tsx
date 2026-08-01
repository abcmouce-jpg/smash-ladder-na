import Image from "next/image";
import { HelpCircle } from "lucide-react";
import { characterIconSlug } from "@/lib/character-icons";

// Falls back to a colored initials badge for any name without a mapped
// icon file (e.g. stale historical data recorded before a roster rename).
const PALETTE = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-lime-600",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-fuchsia-500",
  "bg-pink-500",
] as const;

function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function initialsFor(name: string) {
  const words = name.replace(/[().]/g, "").split(/[\s&/-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function CharacterIcon({
  name,
  size = 24,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  // Matches the "?" random-select icon from the game itself — clearer at a
  // glance than the initials fallback ("RA") every other unmapped name gets.
  if (name === "Random") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-muted-foreground/70 text-background ${className}`}
        style={{ width: size, height: size }}
        title={name}
        aria-hidden="true"
      >
        <HelpCircle size={size * 0.7} />
      </span>
    );
  }

  const slug = characterIconSlug(name);
  if (slug) {
    return (
      <Image
        src={`/characters/${slug}.png`}
        alt={name}
        title={name}
        width={size}
        height={size}
        className={`shrink-0 rounded-full ${className}`}
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${colorFor(name)} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      title={name}
      aria-hidden="true"
    >
      {initialsFor(name)}
    </span>
  );
}
