"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { playMatchFoundChime } from "@/lib/sound";

const POLL_INTERVAL_MS = 5000;

export function LobbyPoller({ matched }: { matched: boolean }) {
  const router = useRouter();
  const wasMatched = useRef(matched);

  useEffect(() => {
    // Skip the refresh while the tab is backgrounded — an idle tab left
    // open (very common while waiting on a match) shouldn't keep burning
    // serverless invocations refreshing a page nobody's looking at. Also
    // fires on visibilitychange so coming back to the tab catches up
    // immediately instead of waiting out the rest of the interval.
    function tick() {
      if (document.visibilityState === "visible") router.refresh();
    }
    const id = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  useEffect(() => {
    if (matched && !wasMatched.current) playMatchFoundChime();
    wasMatched.current = matched;
  }, [matched]);

  return null;
}
