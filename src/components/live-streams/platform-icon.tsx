import { TwitchIcon } from "@/components/twitch-icon";
import { YouTubeIcon } from "@/components/youtube-icon";
import type { StreamPlatform } from "@/lib/stream-links";

/**
 * The brand mark for a stream's platform. Colour is left to the caller — both
 * marks are `currentColor` — so the same component works on a muted chip and a
 * filled purple/red pill.
 */
export function StreamPlatformIcon({ platform, className }: { platform: StreamPlatform; className?: string }) {
  return platform === "twitch" ? <TwitchIcon className={className} /> : <YouTubeIcon className={className} />;
}
