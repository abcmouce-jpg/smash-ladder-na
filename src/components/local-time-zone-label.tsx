"use client";

import { useBrowserTimeZone } from "@/hooks/use-browser-time-zone";
import { shortTimeZoneName } from "@/lib/timezone";

// The viewer's timezone as a short abbreviation (e.g. "EDT", "GMT+2"), used to
// label charts that bucket by it. Falls back to UTC for the server/first paint
// — matching those charts' own fallback — so the label always agrees with the
// buckets rendered on screen.
export function LocalTimeZoneLabel() {
  return <span className="text-xs text-muted-foreground">{shortTimeZoneName(useBrowserTimeZone() ?? "UTC")}</span>;
}
