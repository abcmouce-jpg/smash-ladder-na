"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";

export function OverlayUrlToggle({ baseUrl }: { baseUrl: string }) {
  const [hideRecentMatches, setHideRecentMatches] = useState(false);
  const [hideRatingCard, setHideRatingCard] = useState(false);
  // Stage pick/ban is hidden by default — the streamer opts into showing it
  // by unchecking this (which drops hideStageBans from the URL).
  const [hideStageBans, setHideStageBans] = useState(true);

  const params = new URLSearchParams();
  if (hideRecentMatches) params.set("hideRecentMatches", "1");
  if (hideRatingCard) params.set("hideRatingCard", "1");
  if (hideStageBans) params.set("hideStageBans", "1");
  const queryString = params.toString();
  const url = queryString ? `${baseUrl}?${queryString}` : baseUrl;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={hideRecentMatches}
          onChange={(e) => setHideRecentMatches(e.target.checked)}
          className="size-4 rounded border-border"
        />
        Hide recent matches on overlay
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={hideRatingCard}
          onChange={(e) => setHideRatingCard(e.target.checked)}
          className="size-4 rounded border-border"
        />
        Hide rating card on overlay
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={hideStageBans}
          onChange={(e) => setHideStageBans(e.target.checked)}
          className="size-4 rounded border-border"
        />
        Hide stage pick/ban on overlay
      </label>
      <div className="flex items-center gap-2">
        <code className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-mono break-all max-w-full">
          {url}
        </code>
        <CopyButton text={url} />
      </div>
    </div>
  );
}
