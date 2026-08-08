"use client";

// Synthesized rather than audio files — no asset to ship, and these are
// tiny chimes, not worth a licensed sound effect for. The one exception is
// the match-found sound further down, which plays supplied voice clips
// instead. Best-effort only either way: browsers can block autoplay audio
// outside a direct user gesture, so a rejected play() must never throw into
// the caller.

// A fresh AudioContext created outside a user gesture starts (and stays)
// "suspended" in Chrome/Safari — exactly what happens when a chime fires
// from a polling-triggered router.refresh() (e.g. the victory/tier-up
// chimes below), not a click. A context resumed during a REAL gesture stays
// usable for later programmatic sounds too, so this keeps one shared
// context alive instead of making a fresh (potentially
// permanently-suspended) one per chime.
let sharedCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    if (!sharedCtx) sharedCtx = new AudioContext();
    if (sharedCtx.state === "suspended") void sharedCtx.resume();
    return sharedCtx;
  } catch {
    return null;
  }
}

// Real voice clips for the match-found moment specifically (the exception
// noted above) — picked at random in playMatchFoundSound so repeat queues
// don't all sound the same.
const MATCH_FOUND_CLIPS = [
  "/sounds/vc_menu_narration_enterring.wav",
  "/sounds/vc_menu_narration_challengersapproach.wav",
  "/sounds/vc_menu_narration_enterring_JP.wav",
  "/sounds/vc_menu_narration_ready2.wav",
];

if (typeof window !== "undefined") {
  const unlock = () => {
    getContext();
    // HTMLAudioElement.play() is gated by the same autoplay-gesture policy
    // as AudioContext but isn't unlocked by resuming one — each clip needs
    // its own silent play+pause on this same first gesture. Doing that here
    // also warms the browser's cache for all the clips ahead of the real play.
    MATCH_FOUND_CLIPS.forEach((src) => {
      const audio = new Audio(src);
      audio.play().then(() => audio.pause()).catch(() => {});
    });
  };
  // Any of these count as a user gesture — first one wins, then this is done.
  ["pointerdown", "keydown", "touchstart"].forEach((event) =>
    window.addEventListener(event, unlock, { once: true, passive: true }),
  );
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

export function playMatchFoundSound() {
  const clip = MATCH_FOUND_CLIPS[Math.floor(Math.random() * MATCH_FOUND_CLIPS.length)];
  new Audio(clip).play().catch(() => {
    // Autoplay restrictions, unsupported browser, etc. — silently skip.
  });
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
