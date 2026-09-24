import { getActiveSeason, getSeasonEndsAt, isWithinSeasonEndingWindow } from "@/lib/seasons";
import { SeasonEndingBannerClient } from "@/components/season-ending-banner-client";

const WARNING_WINDOW_MS = 30 * 60 * 1000;

// Server-rendered gate so this only ever ships to the client in the last 30
// minutes before a scheduled rollover — most page loads never see it at all.
export async function SeasonEndingBanner() {
  const active = await getActiveSeason();
  if (!active) return null;

  const endsAt = getSeasonEndsAt(active);
  if (!endsAt || !isWithinSeasonEndingWindow(endsAt, WARNING_WINDOW_MS)) return null;

  return <SeasonEndingBannerClient endsAt={endsAt.toISOString()} seasonName={active.name} />;
}
