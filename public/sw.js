// Service worker for web push (and nothing else — no offline caching on
// purpose; this is a matchmaking app where stale data is worse than offline).
// Registered by src/lib/push-client.ts from the Settings push toggle.
/* global self, clients, atob, fetch */

self.addEventListener("push", function (event) {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch {
    // Non-JSON payload — still show a generic notification below.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Smash Ladder NA", {
      body: data.body || "",
      icon: "/smash_ladder_icon.png",
      badge: "/smash_ladder_icon_white.png",
      vibrate: [100, 50, 100],
      data: { url: data.url || "/lobby" },
    }),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/lobby", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
      for (const client of windowClients) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      return clients.openWindow(url);
    }),
  );
});

// The push service may rotate a subscription (Firefox does this periodically;
// Apple can too). Re-subscribe with the same VAPID key and hand the new
// subscription to the server, which stores it against whichever account is
// signed in on this browser (the fetch carries the session cookie). If any
// step fails, we're no worse off — the next visit to Settings re-syncs.
self.addEventListener("pushsubscriptionchange", function (event) {
  event.waitUntil(
    (async function () {
      const keyResponse = await fetch("/api/push/vapid-public-key").catch(function () {
        return null;
      });
      if (!keyResponse || !keyResponse.ok) return;
      const { key } = await keyResponse.json();
      if (!key) return;
      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
    })(),
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
