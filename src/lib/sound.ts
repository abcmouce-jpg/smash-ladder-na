"use client";

// Synthesized rather than an audio file — no asset to ship, and this is a
// tiny two-note chime, not something worth a licensed sound effect for.
// Best-effort only: browsers can block autoplay audio outside a direct user
// gesture, so a rejected play() must never throw into the caller.
function playTone(ctx: AudioContext, frequency: number, startTime: number, duration: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

export function playVictoryChime() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    playTone(ctx, 660, now, 0.15);
    playTone(ctx, 880, now + 0.12, 0.25);
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Autoplay restrictions, unsupported browser, etc. — silently skip.
  }
}

export function playTierUpChime() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    playTone(ctx, 523, now, 0.14);
    playTone(ctx, 659, now + 0.1, 0.14);
    playTone(ctx, 784, now + 0.2, 0.3);
    setTimeout(() => ctx.close(), 700);
  } catch {
    // Autoplay restrictions, unsupported browser, etc. — silently skip.
  }
}
