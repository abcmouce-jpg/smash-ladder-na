"use client";

import { useEffect, useState } from "react";

function secondsUntil(deadlineMs: number) {
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
}

// Ticks down once a second on the client so the number doesn't visibly
// freeze between the page's ~5s server polls (LobbyPoller) — those still
// own the actual deadline value and whatever happens once it hits 0
// (forfeit, etc.); this only makes the display itself smooth in between.
// suppressHydrationWarning for the same one-paint SSR/CSR clock mismatch
// reason as LocalTime.
/**
 * `format="clock"` renders mm:ss instead of a raw second count.
 *
 * For the prominent timer blocks, where a five-minute window read as "296s"
 * — a number nobody converts in their head. In a sentence ("pick within
 * {n}s") the plain count stays, because a clock reading doesn't take a unit
 * and the sentence needs one.
 */
export function Countdown({ deadline, format = "seconds" }: { deadline: string; format?: "seconds" | "clock" }) {
  const deadlineMs = new Date(deadline).getTime();
  const [seconds, setSeconds] = useState(() => secondsUntil(deadlineMs));

  // Deliberately not also setting state synchronously here for the
  // deadlineMs-changed case (e.g. the server poll advancing to a new
  // game's deadline) — the interval below catches up within a second
  // regardless, and doing it eagerly here would just cascade an extra
  // render for no visible benefit.
  useEffect(() => {
    const id = setInterval(() => setSeconds(secondsUntil(deadlineMs)), 1000);
    return () => clearInterval(id);
  }, [deadlineMs]);

  if (format === "clock") {
    const mm = Math.floor(seconds / 60);
    const ss = String(seconds % 60).padStart(2, "0");
    return <span suppressHydrationWarning>{`${mm}:${ss}`}</span>;
  }
  return <span suppressHydrationWarning>{seconds}</span>;
}
