"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { playMatchFoundSound, type MatchFoundSound } from "@/lib/sound";

const POLL_INTERVAL_MS = 5000;

// Survives a remount (and a reload) so the match-found cue is announced once
// per match per tab: a player who navigates back to /lobby mid-match, or whose
// tab was backgrounded while the cue played, doesn't get told again about a
// match they've already seen. Cleared the moment the poller observes
// matched === false, so the next match announces normally.
const ANNOUNCED_KEY = "smashLadderMatchFoundAnnounced";

function wasAnnouncedThisTab(): boolean {
  try {
    return sessionStorage.getItem(ANNOUNCED_KEY) === "1";
  } catch {
    // Storage unavailable (private mode, blocked cookies) — fall back to
    // announce-once-per-mount below.
    return false;
  }
}

function markAnnouncedThisTab() {
  try {
    sessionStorage.setItem(ANNOUNCED_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

function clearAnnouncedThisTab() {
  try {
    sessionStorage.removeItem(ANNOUNCED_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function LobbyPoller({
  matched,
  keepPollingInBackground = false,
  audioPingOnMatch = true,
  matchFoundSound = "CHIME",
}: {
  matched: boolean;
  // While still waiting in queue, a background/minimized tab needs to keep
  // polling anyway — that's exactly when someone's tabbed away and is
  // relying on playMatchFoundSound below to actually notice they've been
  // paired. (Real complaint: matches auto-forfeited because the tab was
  // backgrounded when the match was found.) Audio playback keeps running in
  // a backgrounded tab even though rendering doesn't, so the sound itself
  // isn't the blocker — only the paused polling was. Once matched (or in
  // the post-set chat window), it's not urgent the same way, so this goes
  // back to the original skip-while-hidden behavior.
  keepPollingInBackground?: boolean;
  // Settings toggle (default on, matching the chime's original always-on
  // behavior before this existed) — see setAudioPingOnMatch.
  audioPingOnMatch?: boolean;
  matchFoundSound?: MatchFoundSound;
  // Which sound the ping plays when on — see User.matchFoundSound. Defaults
  // to the original chime (CHIME).
}) {
  const router = useRouter();
  // Guards against replaying the cue within a single mount (the sessionStorage
  // flag below can be unavailable, and a dependency change shouldn't re-fire
  // it). Deliberately NOT seeded from `matched`: the poller also mounts
  // *already* matched — the join-time pairing case, where the Server Action's
  // re-render replaces the pre-join tree — and that player still needs the cue.
  const announcedThisMount = useRef(false);
  // A match-found cue attempted while hidden can still be inaudible — mobile
  // browsers suspend the whole page, and some platforms suspend the
  // AudioContext with it. playMatchFoundSound reports whether the attempt was
  // actually audible, and when it wasn't we replay on return to the tab (a
  // chime you never heard is worse than one that plays twice).
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
    if (!matched) {
      // No live match — let the next one announce again.
      clearAnnouncedThisTab();
      announcedThisMount.current = false;
      return;
    }
    if (announcedThisMount.current || wasAnnouncedThisTab()) return;
    announcedThisMount.current = true;
    markAnnouncedThisTab();
    toast.success("Opponent found!", { description: "Get ready — your match is starting." });
    if (audioPingOnMatch) {
      // Play even in a backgrounded tab — on desktop a running AudioContext
      // keeps playing while hidden, which is the whole point of the
      // keep-polling-in-background flag above. Only fall back to the
      // replay-on-return path when the attempt couldn't have been heard
      // (e.g. a fully-suspended mobile tab).
      const played = playMatchFoundSound(matchFoundSound);
      if (document.visibilityState === "hidden" && !played) missedChimeWhileHidden.current = true;
    }
  }, [matched, audioPingOnMatch, matchFoundSound]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "visible" || !missedChimeWhileHidden.current) return;
      missedChimeWhileHidden.current = false;
      if (audioPingOnMatch) playMatchFoundSound(matchFoundSound);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [audioPingOnMatch, matchFoundSound]);

  return null;
}
