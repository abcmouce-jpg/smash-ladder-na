"use client";

import { useEffect, useState } from "react";

function elapsedLabel(joinedAtMs: number) {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - joinedAtMs) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

// Ticks up once a second on the client so the time spent waiting in queue
// doesn't freeze between the page's ~5s server polls (LobbyPoller) — the
// server re-renders still own the actual joinedAt value; this only makes
// the display itself smooth in between. suppressHydrationWarning for the
// same one-paint SSR/CSR clock mismatch reason as Countdown.
export function QueueTimer({ joinedAt }: { joinedAt: string }) {
  const joinedAtMs = new Date(joinedAt).getTime();
  const [label, setLabel] = useState(() => elapsedLabel(joinedAtMs));

  useEffect(() => {
    const id = setInterval(() => setLabel(elapsedLabel(joinedAtMs)), 1000);
    return () => clearInterval(id);
  }, [joinedAtMs]);

  return <span suppressHydrationWarning>{label}</span>;
}
