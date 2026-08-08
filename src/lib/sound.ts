"use client";

// Synthesized rather than an audio file — no asset to ship, and this is a
// tiny two-note chime, not something worth a licensed sound effect for.
// Best-effort only: browsers can block autoplay audio outside a direct user
// gesture, so a rejected play() must never throw into the caller.

// A fresh AudioContext created outside a user gesture starts (and stays)
// "suspended" in Chrome/Safari — exactly what happens when the match-found
// chime fires from a polling-triggered router.refresh(), not a click. A
// context resumed during a REAL gesture stays usable for later programmatic
// sounds too, so this keeps one shared context alive instead of making a
// fresh (potentially permanently-suspended) one per chime.
let sharedCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    if (!sharedCtx) {
      // Older iOS Safari (<14.5) only exposes the prefixed constructor —
      // without it, mobile silently gets no chime at all.
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      sharedCtx = new Ctor();
    }
    if (sharedCtx.state === "suspended") {
      // resume() outside a user gesture rejects on iOS (and can reject on
      // Android after the tab was backgrounded) — the rejection must never
      // surface as an unhandled promise error. The attempt itself is still
      // worth making: on desktop and Android Chrome it often succeeds, which
      // is how a previously-unlocked context keeps working across refreshes.
      sharedCtx.resume().catch(() => {});
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

if (typeof window !== "undefined") {
  const unlock = () => getContext();
  // Any of these count as a user gesture — first one wins, then this is done.
  ["pointerdown", "keydown", "touchstart"].forEach((event) =>
    window.addEventListener(event, unlock, { once: true, passive: true }),
  );
  // Browsers suspend audio output for hidden tabs; on return the context can
  // still be suspended. Retry the resume when the tab becomes visible again
  // (same gesture-less attempt as above — it's a best-effort recovery, and
  // where the platform allows it, this is exactly when a missed match-found
  // chime gets replayed by LobbyPoller).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") getContext();
  });
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume = 0.2,
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

export function playVictoryChime() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    playTone(ctx, 660, now, 0.15);
    playTone(ctx, 880, now + 0.12, 0.25);
  } catch {
    // Autoplay restrictions, unsupported browser, etc. — silently skip.
  }
}

export function playMatchFoundChime() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    playTone(ctx, 587, now, 0.12, 0.5);
    playTone(ctx, 740, now + 0.1, 0.2, 0.5);
  } catch {
    // Autoplay restrictions, unsupported browser, etc. — silently skip.
  }
}

// A single short blip — for a value updating on screen (e.g. the room code
// changing), not a celebratory moment like the chimes above.
export function playUpdateBlip() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    playTone(ctx, 660, now, 0.08);
  } catch {
    // Autoplay restrictions, unsupported browser, etc. — silently skip.
  }
}

export function playTierUpChime() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    playTone(ctx, 523, now, 0.14);
    playTone(ctx, 659, now + 0.1, 0.14);
    playTone(ctx, 784, now + 0.2, 0.3);
  } catch {
    // Autoplay restrictions, unsupported browser, etc. — silently skip.
  }
}
