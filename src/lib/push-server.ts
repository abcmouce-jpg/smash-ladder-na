// Server side of web push: encrypts and delivers match-found notifications to
// whatever browsers the player subscribed from (see src/lib/push-client.ts for
// the subscribing side, public/sw.js for delivery/display, and the Settings
// "Push notifications when matched" toggle). Fully no-op until VAPID keys are
// configured — same "silently skip when unset" pattern as the Discord bot
// token, so this is safe to ship ahead of key setup.
import webpush from "web-push";
import { prisma } from "@/lib/db";
import { LobbyEntryStatus, UserStatus } from "@/generated/prisma/enums";
import { getRegionsWithinDistance } from "@/lib/regions";
import { getBlockedEitherWayIds } from "@/lib/blocks";
import { ratingGapAllows, effectiveMaxRatingGap, wiredRequirementAllows } from "@/lib/match-compat";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim();
const VAPID_SUBJECT = process.env.VAPID_SUBJECT?.trim();

export const pushConfigured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);

if (pushConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT!, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
}

// TTL tells the push SERVICE (FCM/APNs/etc.) how long to keep retrying
// delivery to a sleeping/backgrounded device before giving up and silently
// discarding the message — it does not delay delivery on our end. The
// original 120s was too short to matter for exactly the devices that need
// it most: a phone locked or a laptop backgrounded rarely wakes for a push
// within 2 minutes, so the message was getting dropped before ever
// reaching them, not delivered-but-late. Real incident: a player waiting
// live on stream missed their match entirely and only found out by
// manually checking back — no notification ever showed. Raised to cover
// both per-game auto-forfeit windows (CHARACTER_TIMEOUT_MS 2min,
// REPORT_TIMEOUT_MS 5min in match-games.ts) with room for the push service
// to actually wake the device, not just match how long we'd want the
// message to remain relevant.
const PUSH_TTL_SECONDS = 5 * 60;

const MATCH_FOUND_MESSAGES = {
  en: { title: "Match found!", body: "You've been paired — head to the Lobby." },
  es: { title: "¡Partida encontrada!", body: "Te emparejaron — ve a la Sala." },
} as const;

const QUEUE_OPPORTUNITY_MESSAGES = {
  en: { title: "Opponent in your range just queued", body: "Jump in now while they're still waiting." },
  es: { title: "Un rival en tu rango acaba de entrar a la cola", body: "Entra ahora mientras sigue esperando." },
} as const;

const NEW_GUIDE_MESSAGES = {
  en: (character: string) => ({
    title: "New community guide",
    body: `Someone posted a new guide for ${character}.`,
  }),
  es: (character: string) => ({
    title: "Nueva guía de la comunidad",
    body: `Alguien publicó una nueva guía para ${character}.`,
  }),
} as const;

const TEST_MESSAGES = {
  en: {
    title: "Test notification",
    body: "Push notifications are working — you'll get an alert here when you're matched.",
  },
  es: {
    title: "Notificación de prueba",
    body: "Las notificaciones push funcionan — te avisaremos aquí cuando te emparejen.",
  },
} as const;

type StoredSubscription = { id: string; endpoint: string; p256dh: string; auth: string };

// Sends one payload to every subscription in the list. Best-effort by design:
// a failure on one subscription never throws for the rest. Subscriptions the
// push service reports as gone (404/410 — uninstalled browser, revoked
// permission, push service rotation) are deleted so we don't keep paying to
// send into the void; anything else is left alone and retried next time.
async function sendPushPayload(subscriptions: StoredSubscription[], payload: string): Promise<number> {
  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: PUSH_TTL_SECONDS },
      );
      sent++;
    } catch (err) {
      if (err instanceof webpush.WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      } else {
        // Anything else (rate limits, malformed keys, push service errors)
        // was previously silent — no way to tell "delivery is unreliable"
        // from "nobody's subscribed" after the fact. Logged, not thrown:
        // this must still never break match creation for the rest of the
        // pairing flow.
        console.error("push send failed:", err instanceof Error ? err.message : err);
      }
    }
  }
  return sent;
}

// Called right after a match is created (join-time pairing and the cron
// sweep). Never throws, so a push failure can't break the pairing itself.
export async function notifyMatchFoundToUsers(player1Id: string, player2Id: string) {
  if (!pushConfigured) return 0;

  const players = await prisma.user.findMany({
    where: { id: { in: [player1Id, player2Id] } },
    select: {
      preferredLanguage: true,
      pushSubscriptions: {
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      },
    },
  });

  let sent = 0;
  for (const player of players) {
    if (player.pushSubscriptions.length === 0) continue;
    const copy = player.preferredLanguage === "es" ? MATCH_FOUND_MESSAGES.es : MATCH_FOUND_MESSAGES.en;
    sent += await sendPushPayload(
      player.pushSubscriptions,
      JSON.stringify({
        title: copy.title,
        body: copy.body,
        url: "/lobby",
        icon: "/smash_ladder_icon.png",
      }),
    );
  }
  return sent;
}

// Per-candidate rate limit for notifyQueueOpportunitySubscribers below — a
// busy stretch of joins in someone's rating/region range could otherwise
// fire one push per join. 20 minutes rather than the original 5: this is an
// opt-in convenience ping, not a match-found alert, so it should stay rare
// enough to never feel like spam even for a subscriber in a very active
// bracket.
const QUEUE_OPPORTUNITY_NOTIFY_COOLDOWN_MS = 20 * 60 * 1000;

// Called from joinLobbyAndTryPair (lobby.ts) only when a fresh join found no
// immediate opponent — tells anyone who opted in (User.notifyQueueOpportunities)
// and isn't already queued themselves that someone matchable just showed up,
// so they can jump into the queue while that entry is still WAITING. Never
// throws, same contract as the other notify* functions here; called via
// after() from the caller so it can't delay the join response.
//
// Deliberately anonymous: QUEUE_OPPORTUNITY_MESSAGES never names the joiner,
// states their rating, or gives anything else identifying — unlike
// notifyMatchmakingSubscribers (free-battle.ts), which names the post's
// author because claiming a Free Battle post is a deliberate, consensual
// act. Here the joiner never agreed to be identified just for queuing, so
// the ping only ever says "someone" is around.
export async function notifyQueueOpportunitySubscribers(
  joinerId: string,
  joiner: {
    region: string;
    rating: number;
    maxMatchDistanceKm: number | null;
    wiredConnection: boolean;
    requireWiredOpponent: boolean;
  },
  joinerReach: string[],
  joinerEffectiveGap: number | null,
) {
  if (!pushConfigured) return 0;

  const cooldownCutoff = new Date(Date.now() - QUEUE_OPPORTUNITY_NOTIFY_COOLDOWN_MS);
  const blockedIds = await getBlockedEitherWayIds(joinerId);

  const candidates = await prisma.user.findMany({
    where: {
      id: { notIn: [joinerId, ...blockedIds] },
      status: { not: UserStatus.BANNED },
      notifyQueueOpportunities: true,
      OR: [{ queueOpportunityNotifiedAt: null }, { queueOpportunityNotifiedAt: { lt: cooldownCutoff } }],
      lobbyEntries: { none: { status: { in: [LobbyEntryStatus.WAITING, LobbyEntryStatus.PAIRED] } } },
      pushSubscriptions: { some: {} },
    },
    select: {
      id: true,
      region: true,
      maxMatchDistanceKm: true,
      rating: true,
      maxRatingGap: true,
      gamesPlayed: true,
      wiredConnection: true,
      requireWiredOpponent: true,
      preferredLanguage: true,
      pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
    },
  });

  // Both directions matter, same as sweepLobbyPairing's canMatch: the
  // candidate's own region must be within the joiner's reach, AND the
  // joiner's region must be within the candidate's own declared reach —
  // one side having a wide radius doesn't override the other's tighter one.
  const eligible = candidates.filter(
    (c) =>
      c.region !== null &&
      joinerReach.includes(c.region) &&
      getRegionsWithinDistance(c.region, c.maxMatchDistanceKm).includes(joiner.region) &&
      ratingGapAllows(joiner.rating, c.rating, effectiveMaxRatingGap(c)) &&
      ratingGapAllows(joiner.rating, c.rating, joinerEffectiveGap) &&
      wiredRequirementAllows(joiner, c),
  );
  if (eligible.length === 0) return 0;

  let sent = 0;
  for (const candidate of eligible) {
    const copy = candidate.preferredLanguage === "es" ? QUEUE_OPPORTUNITY_MESSAGES.es : QUEUE_OPPORTUNITY_MESSAGES.en;
    sent += await sendPushPayload(
      candidate.pushSubscriptions,
      JSON.stringify({ title: copy.title, body: copy.body, url: "/lobby", icon: "/smash_ladder_icon.png" }),
    );
  }
  // Written for everyone eligible, not just those a push actually reached —
  // best-effort delivery shouldn't turn into a retry storm against a
  // candidate whose subscription is merely slow/erroring.
  await prisma.user.updateMany({
    where: { id: { in: eligible.map((c) => c.id) } },
    data: { queueOpportunityNotifiedAt: new Date() },
  });
  return sent;
}

// Called right after a new CharacterGuide is created (see
// deferGuideNotification in character-guides.ts). Notifies everyone
// subscribed to that character via the bell on /notes, except the author
// themselves. Never throws, same reasoning as notifyMatchFoundToUsers.
export async function notifyCharacterGuideSubscribers(character: string, authorId: string) {
  if (!pushConfigured) return 0;

  const subscribers = await prisma.user.findMany({
    where: { id: { not: authorId }, characterGuideSubscriptions: { some: { character } } },
    select: {
      preferredLanguage: true,
      pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
    },
  });

  let sent = 0;
  for (const subscriber of subscribers) {
    if (subscriber.pushSubscriptions.length === 0) continue;
    const copy =
      subscriber.preferredLanguage === "es" ? NEW_GUIDE_MESSAGES.es(character) : NEW_GUIDE_MESSAGES.en(character);
    sent += await sendPushPayload(
      subscriber.pushSubscriptions,
      JSON.stringify({
        title: copy.title,
        body: copy.body,
        url: "/notes",
        icon: "/smash_ladder_icon.png",
      }),
    );
  }
  return sent;
}

// Backs the "Send test" button on the Settings push toggle — delivers to
// every subscription on the account so a player with several devices can
// verify all of them at once. Returns { error } instead of throwing so the
// settings UI can show the reason inline.
export async function sendTestPushToUser(userId: string): Promise<{ sent: number; error?: string }> {
  if (!pushConfigured) {
    return { sent: 0, error: "Push notifications aren't set up on this site yet." };
  }
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      preferredLanguage: true,
      pushSubscriptions: {
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      },
    },
  });
  if (user.pushSubscriptions.length === 0) {
    return { sent: 0, error: "No push subscriptions on this account — toggle notifications off and on again." };
  }
  const copy = user.preferredLanguage === "es" ? TEST_MESSAGES.es : TEST_MESSAGES.en;
  const sent = await sendPushPayload(
    user.pushSubscriptions,
    JSON.stringify({
      title: copy.title,
      body: copy.body,
      url: "/settings",
      icon: "/smash_ladder_icon.png",
    }),
  );
  if (sent === 0) {
    return { sent: 0, error: "Couldn't deliver a test notification — toggle notifications off and on again." };
  }
  return { sent };
}
