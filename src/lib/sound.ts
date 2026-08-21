"use client";

// Synthesized rather than audio files — no asset to ship, and these are
// tiny chimes, not worth a licensed sound effect for. The one exception is
// the match-found announcer clips further down, which play supplied voice
// clips instead. Best-effort only either way: browsers can block autoplay
// audio outside a direct user gesture, so a rejected play() must never
// throw into the caller.

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
    if (!sharedCtx) {
      // Older iOS Safari (<14.5) only exposes the prefixed constructor —
      // without it, mobile silently gets no chime at all.
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

// Which sound plays when a match is found — the player's pick in Settings
// (User.matchFoundSound). Values match the Prisma enum of the same name.
export type MatchFoundSound = "CHIME" | "ANNOUNCER";

// Real voice clips for the match-found moment specifically (the exception
// noted above) — picked at random in playMatchFoundSound so repeat queues
// don't all sound the same.
const MATCH_FOUND_CLIPS = [
  "/sounds/vc_menu_narration_enterring.wav",
  "/sounds/vc_menu_narration_challengersapproach.wav",
  "/sounds/vc_menu_narration_enterring_JP.wav",
  "/sounds/vc_menu_narration_ready2.wav",
];

// The announcer clips decoded for the shared context, ready by match time.
// They play through Web Audio instead of an <audio> element on purpose: on
// mobile the element claims the device's audio session and pauses whatever
// music the player has going (Spotify, etc.), while the audio graph mixes
// alongside it. decodeAudioData is async, so they're prefetched on the first
// user gesture — the join-lobby click — which is always long before a match
// can actually be found.
const clipBuffers = new Map<string, AudioBuffer>();

function preloadClips() {
  MATCH_FOUND_CLIPS.forEach((src) => {
    fetch(src)
      .then((response) => response.arrayBuffer())
      .then((data) => {
        const ctx = getContext();
        if (!ctx) return;
        // Callback form — the promise overload isn't available on the oldest
        // iOS Safari this supports (the same webkitAudioContext range).
        ctx.decodeAudioData(
          data,
          (buffer) => clipBuffers.set(src, buffer),
          () => {},
        );
      })
      .catch(() => {
        // Network or decode failure — playMatchFoundClip falls back to the
        // element, which can still play from a direct click.
      });
  });
}

if (typeof window !== "undefined") {
  const unlock = () => {
    getContext();
    preloadClips();
  };
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

function playTone(ctx: AudioContext, frequency: number, startTime: number, duration: number, volume = 0.2) {
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

// The original match-found sound, restored for players who preferred it to
// the announcer clips: a short two-note chime, synthesized so it needs no
// asset. Kept as a module-private helper — playMatchFoundSound dispatches
// to it for the "CHIME" setting. Returns whether the cue was audible (see
// playMatchFoundSound).
function playMatchFoundChime(): boolean {
  const ctx = getContext();
  if (!ctx) return false;
  try {
    const now = ctx.currentTime;
    playTone(ctx, 587, now, 0.12, 0.5);
    playTone(ctx, 740, now + 0.1, 0.2, 0.5);
    // A suspended context renders nothing (hidden/mobile tabs), and the
    // caller needs to know the cue was actually heard.
    return ctx.state === "running";
  } catch {
    // Autoplay restrictions, unsupported browser, etc. — silently skip.
    return false;
  }
}

// Plays the match-found cue for the chosen style. Returns whether the sound
// was expected to have been audible: false when there's no context to play
// through, or when the context is suspended (e.g. a fully-suspended mobile
// tab). LobbyPoller uses that to queue the replay-on-return fallback instead
// of double-playing a cue that was actually heard from a backgrounded tab.
export function playMatchFoundSound(style: MatchFoundSound): boolean {
  if (style === "CHIME") return playMatchFoundChime();
  return playMatchFoundClip();
}

function playMatchFoundClip(): boolean {
  const ctx = getContext();
  if (!ctx) return false;
  const clip = MATCH_FOUND_CLIPS[Math.floor(Math.random() * MATCH_FOUND_CLIPS.length)];
  const buffer = clipBuffers.get(clip);
  if (!buffer) {
    // Matched before the first-gesture prefetch decoded the clip — the
    // element is the fallback of last resort (it still plays within a direct
    // click, e.g. the settings preview, and keeps playing in a backgrounded
    // desktop tab).
    new Audio(clip).play().catch(() => {
      // Autoplay restrictions, unsupported browser, etc. — silently skip.
    });
    return true;
  }
  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
    return ctx.state === "running";
  } catch {
    // Autoplay restrictions, unsupported browser, etc. — silently skip.
    return false;
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
