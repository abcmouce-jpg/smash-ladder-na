"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";

function msRemaining(deadlineMs: number) {
  return Math.max(0, deadlineMs - Date.now());
}

// Wraps the "Search new opponent" button: while a timeout cooldown is
// still active, shows a live countdown instead of the button (children).
// Ticks down locally rather than waiting on the next server poll — the
// server enforces the real deadline regardless (joinLobbyAndTryPair), this
// is purely so the button reappears the moment the wait is actually over.
export function QueueCooldownGate({
  cooldownUntil,
  children,
  lang = "en",
}: {
  cooldownUntil: string | null;
  children: React.ReactNode;
  lang?: Lang;
}) {
  const deadlineMs = cooldownUntil ? new Date(cooldownUntil).getTime() : 0;
  const [remainingMs, setRemainingMs] = useState(() => msRemaining(deadlineMs));

  // Deliberately not also setting state synchronously here for the
  // deadlineMs-changed case — the interval below catches up within a
  // second regardless, same as Countdown.
  useEffect(() => {
    if (!cooldownUntil) return;
    const id = setInterval(() => setRemainingMs(msRemaining(deadlineMs)), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil, deadlineMs]);

  if (!cooldownUntil || remainingMs <= 0) return <>{children}</>;

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const countdown = (
    <span className="font-medium tabular-nums" suppressHydrationWarning>
      {minutes}:{seconds.toString().padStart(2, "0")}
    </span>
  );

  return (
    <p className="text-sm text-muted-foreground">
      {lang === "es" ? (
        <>Perdiste tu última partida por tiempo — puedes volver a entrar a la cola en {countdown}.</>
      ) : (
        <>You timed out of your last match — you can queue again in {countdown}.</>
      )}
    </p>
  );
}
