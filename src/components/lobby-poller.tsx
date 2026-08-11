"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { playMatchFoundChime } from "@/lib/sound";

const POLL_INTERVAL_MS = 5000;

export function LobbyPoller({
  matched,
  keepPollingInBackground = false,
  audioPingOnMatch = true,
}: {
  matched: boolean;
  // While still waiting in queue, a background/minimized tab needs to keep
  // polling anyway — that's exactly when someone's tabbed away and is
  // relying on playMatchFoundChime below to actually notice they've been
  // paired. (Real complaint: matches auto-forfeited because the tab was
  // backgrounded when the match was found.) Web Audio keeps running in a
  // backgrounded tab even though rendering doesn't, so the chime itself
  // isn't the blocker — only the paused polling was. Once matched (or in
  // the post-set chat window), it's not urgent the same way, so this goes
  // back to the original skip-while-hidden behavior.
  keepPollingInBackground?: boolean;
  // Settings toggle (default on, matching the chime's original always-on
  // behavior before this existed) — see setAudioPingOnMatch.
  audioPingOnMatch?: boolean;
}) {
  const router = useRouter();
  const wasMatched = useRef(matched);
  // Browsers mute audio for hidden tabs (and mobile browsers can suspend it
  // entirely), so the one-shot match-found chime can fire and get dropped
  // while the player is tabbed away. Remember it and replay on return — a
  // chime you never heard is worse than one that plays twice.
  const missedChimeWhileHidden = useRef(false);

  useEffect(() => {
    // Skip the refresh while the tab is backgrounded — an idle tab left
    // open (very common while waiting on a match) shouldn't keep burning
    // serverless invocations refreshing a page nobody's looking at. Also
    // fires on visibilitychange so coming back to the tab catches up
    // immediately instead of waiting out the rest of the interval.
    function tick() {
      if (keepPollingInBackground || document.visibilityState === "visible") router.refresh();
    }
    const id = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, keepPollingInBackground]);

  useEffect(() => {
    if (matched && !wasMatched.current) {
      if (audioPingOnMatch) {
        if (document.visibilityState === "hidden") missedChimeWhileHidden.current = true;
        else playMatchFoundChime();
      }
    }
    wasMatched.current = matched;
  }, [matched, audioPingOnMatch]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "visible" || !missedChimeWhileHidden.current) return;
      missedChimeWhileHidden.current = false;
      if (audioPingOnMatch) playMatchFoundChime();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [audioPingOnMatch]);

  return null;
}
