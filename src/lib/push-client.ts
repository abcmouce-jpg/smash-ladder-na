"use client";

// Client side of web push — subscribing/unsubscribing this browser and the
// VAPID key conversion the PushManager API needs. The subscription's actual
// delivery happens server-side (src/lib/push-server.ts) and display happens
// in the service worker (public/sw.js).

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

// The PushManager API takes the VAPID public key as a Uint8Array of raw
// bytes; env vars are base64url-encoded strings.
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  } catch {
    return null;
  }
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!registration) return null;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

// Ask for permission and subscribe this browser. Returns either the fresh
// subscription or a human-readable error string for the settings UI.
export async function subscribeToPush(): Promise<{ subscription: PushSubscription } | { error: string }> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return { error: "Push notifications aren't set up on this site yet." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      error:
        permission === "denied"
          ? "Notification permission is blocked — allow it in your browser's site settings, then try again."
          : "Notification permission wasn't granted.",
    };
  }
  const registration = await registerPushServiceWorker();
  if (!registration) return { error: "Push notifications aren't supported in this browser." };
  try {
    return { subscription: await subscribeWithVapidKey(registration, publicKey) };
  } catch (err) {
    if (isInvalidStateError(err)) {
      // A subscription already exists under a different application server
      // key (e.g. the site's VAPID keys were rotated since this browser last
      // subscribed). The Push API refuses to subscribe over it, so drop the
      // stale one and try once more.
      try {
        const stale = await getPushSubscription();
        await stale?.unsubscribe();
        return { subscription: await subscribeWithVapidKey(registration, publicKey) };
      } catch (retryErr) {
        return { error: subscriptionError(retryErr) };
      }
    }
    return { error: subscriptionError(err) };
  }
}

async function subscribeWithVapidKey(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<PushSubscription> {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

function isInvalidStateError(err: unknown): boolean {
  return err instanceof Error && err.name === "InvalidStateError";
}

// Map a subscribe() failure to something actionable instead of the old
// catch-all. The two failures that happen after permission is granted are a
// subscription conflict (handled above) and an unreachable push service —
// Chromium forks with a built-in VPN/ad-blocker (Helium Browser is one)
// commonly filter the push service request and reject with AbortError or
// NotSupportedError.
function subscriptionError(err: unknown): string {
  if (err instanceof Error) {
    switch (err.name) {
      case "NotAllowedError":
        return "Notification permission is blocked — allow it in your browser's site settings, then try again.";
      case "AbortError":
      case "NotSupportedError":
        return "This browser couldn't reach its push service. VPNs, ad-blockers, and privacy settings can block it — try turning those off for this site, or use Chrome, Firefox, or Safari.";
    }
    // Unknown failure: log the details so the next report has a console line
    // to point at, and keep the user-facing message generic.
    console.error("push subscribe failed:", err.name, err.message);
  }
  return "Couldn't subscribe this browser — try again in a moment.";
}

export async function unsubscribeFromPush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const subscription = (await registration?.pushManager.getSubscription()) ?? null;
    if (subscription) await subscription.unsubscribe();
    return subscription;
  } catch {
    return null;
  }
}
