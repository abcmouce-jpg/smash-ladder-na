"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Same cadence as LobbyPoller, so being paired surfaces just as quickly from
// any other page as it does from /lobby itself — and the same "skip while the
// tab is hidden" rule, since a queue can sit for minutes and a backgrounded
// tab shouldn't keep re-running the current page's queries for nobody.
const POLL_INTERVAL_MS = 5000;

// Only mounted while QueueStatusBanner is actually showing a queue or match
// state (see that component), so an idle visitor never polls at all.
export function QueueStatusPoller() {
  const router = useRouter();

  useEffect(() => {
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

  return null;
}
