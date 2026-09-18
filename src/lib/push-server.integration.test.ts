import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/test/factories";
import { blockUser } from "@/lib/blocks";
import { LobbyEntryStatus } from "@/generated/prisma/enums";

vi.mock("web-push", () => {
  class WebPushError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  return {
    default: {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn(),
      WebPushError,
    },
  };
});

import webpush from "web-push";

const sendNotificationMock = vi.mocked(webpush.sendNotification);

let notifyMatchFoundToUsers: (player1Id: string, player2Id: string) => Promise<number>;
let sendTestPushToUser: (userId: string) => Promise<{ sent: number; error?: string }>;
let notifyQueueOpportunitySubscribers: (
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
) => Promise<number>;

beforeAll(async () => {
  // push-server reads the VAPID env vars at module load — stub them before
  // the (dynamic) import so the module thinks it's configured.
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
  ({ notifyMatchFoundToUsers, sendTestPushToUser, notifyQueueOpportunitySubscribers } = await import(
    "@/lib/push-server"
  ));
});

afterEach(() => {
  sendNotificationMock.mockReset();
});

function subscribeUser(userId: string, endpoint: string) {
  return prisma.pushSubscription.create({
    data: { userId, endpoint, p256dh: "p256dh-bytes", auth: "auth-secret" },
  });
}

describe("notifyMatchFoundToUsers", () => {
  it("sends to every subscription of both players, once each", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await subscribeUser(a.id, "https://push.example.com/a1");
    await subscribeUser(a.id, "https://push.example.com/a2");
    await subscribeUser(b.id, "https://push.example.com/b1");
    sendNotificationMock.mockResolvedValue({ statusCode: 201, body: "", headers: {} });

    const sent = await notifyMatchFoundToUsers(a.id, b.id);

    expect(sent).toBe(3);
    expect(sendNotificationMock).toHaveBeenCalledTimes(3);
    const endpoints = sendNotificationMock.mock.calls.map(([sub]) => sub.endpoint).sort();
    expect(endpoints).toEqual([
      "https://push.example.com/a1",
      "https://push.example.com/a2",
      "https://push.example.com/b1",
    ]);
    const payload = JSON.parse(String(sendNotificationMock.mock.calls[0][1]));
    expect(payload).toMatchObject({ title: "Match found!", url: "/lobby" });
    expect(payload.body).toMatch(/paired/i);
    expect(sendNotificationMock.mock.calls[0][2]).toMatchObject({ TTL: 300 });
  });

  it("uses Spanish copy for players with preferredLanguage es", async () => {
    const a = await createTestUser({ preferredLanguage: "es" });
    const b = await createTestUser();
    await subscribeUser(a.id, "https://push.example.com/es");
    sendNotificationMock.mockResolvedValue({ statusCode: 201, body: "", headers: {} });

    await notifyMatchFoundToUsers(a.id, b.id);

    const payload = JSON.parse(String(sendNotificationMock.mock.calls[0][1]));
    expect(payload.title).toBe("¡Partida encontrada!");
  });

  it("skips players without any subscription", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await subscribeUser(a.id, "https://push.example.com/only-a");

    const sent = await notifyMatchFoundToUsers(a.id, b.id);

    expect(sent).toBe(1);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("deletes subscriptions the push service reports as gone (410/404)", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const sub = await subscribeUser(a.id, "https://push.example.com/dead");
    sendNotificationMock.mockRejectedValue(new webpush.WebPushError("gone", 410, {}, "", sub.endpoint));

    const sent = await notifyMatchFoundToUsers(a.id, b.id);

    expect(sent).toBe(0);
    await expect(prisma.pushSubscription.findUnique({ where: { id: sub.id } })).resolves.toBeNull();
  });

  it("keeps subscriptions on transient failures so they can retry next match", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const sub = await subscribeUser(a.id, "https://push.example.com/flaky");
    sendNotificationMock.mockRejectedValue(new webpush.WebPushError("boom", 500, {}, "", sub.endpoint));

    await expect(notifyMatchFoundToUsers(a.id, b.id)).resolves.toBe(0);
    await expect(prisma.pushSubscription.findUnique({ where: { id: sub.id } })).resolves.not.toBeNull();
  });
});

describe("sendTestPushToUser", () => {
  it("sends a test payload to every subscription on the account", async () => {
    const user = await createTestUser();
    await subscribeUser(user.id, "https://push.example.com/t1");
    await subscribeUser(user.id, "https://push.example.com/t2");
    sendNotificationMock.mockResolvedValue({ statusCode: 201, body: "", headers: {} });

    const result = await sendTestPushToUser(user.id);

    expect(result).toEqual({ sent: 2 });
    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(String(sendNotificationMock.mock.calls[0][1]));
    expect(payload.title).toBe("Test notification");
    expect(payload.url).toBe("/settings");
  });

  it("uses Spanish copy for es-preference players", async () => {
    const user = await createTestUser({ preferredLanguage: "es" });
    await subscribeUser(user.id, "https://push.example.com/es-test");
    sendNotificationMock.mockResolvedValue({ statusCode: 201, body: "", headers: {} });

    const result = await sendTestPushToUser(user.id);

    expect(result.sent).toBe(1);
    const payload = JSON.parse(String(sendNotificationMock.mock.calls[0][1]));
    expect(payload.title).toBe("Notificación de prueba");
  });

  it("returns an error instead of throwing when there are no subscriptions", async () => {
    const user = await createTestUser();
    const result = await sendTestPushToUser(user.id);
    expect(result.sent).toBe(0);
    expect(result.error).toMatch(/subscriptions/i);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("returns an error when every subscription is dead", async () => {
    const user = await createTestUser();
    await subscribeUser(user.id, "https://push.example.com/dead-test");
    sendNotificationMock.mockRejectedValue(
      new webpush.WebPushError("gone", 410, {}, "", "https://push.example.com/dead-test"),
    );

    const result = await sendTestPushToUser(user.id);

    expect(result.sent).toBe(0);
    expect(result.error).toMatch(/off and on/i);
  });
});

describe("notifyQueueOpportunitySubscribers", () => {
  function joinerParams(overrides: Partial<{ region: string; rating: number; maxMatchDistanceKm: number | null }> = {}) {
    return {
      region: "USA East",
      rating: 1500,
      maxMatchDistanceKm: 2400,
      wiredConnection: false,
      requireWiredOpponent: false,
      ...overrides,
    };
  }

  it("notifies an opted-in, unqueued candidate within region and rating range", async () => {
    const joiner = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const candidate = await createTestUser({
      rating: 1520,
      gamesPlayed: 20,
      region: "USA East",
      notifyQueueOpportunities: true,
    });
    await subscribeUser(candidate.id, "https://push.example.com/opportunity");
    sendNotificationMock.mockResolvedValue({ statusCode: 201, body: "", headers: {} });

    const sent = await notifyQueueOpportunitySubscribers(joiner.id, joinerParams(), ["USA East"], null);

    expect(sent).toBe(1);
    const payload = JSON.parse(String(sendNotificationMock.mock.calls[0][1]));
    expect(payload).toMatchObject({ url: "/lobby" });
    expect(payload.title).toMatch(/queued/i);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(updated.queueOpportunityNotifiedAt).not.toBeNull();
  });

  it("skips candidates who haven't opted in", async () => {
    const joiner = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const candidate = await createTestUser({ rating: 1500, gamesPlayed: 20, region: "USA East" });
    await subscribeUser(candidate.id, "https://push.example.com/not-opted-in");

    const sent = await notifyQueueOpportunitySubscribers(joiner.id, joinerParams(), ["USA East"], null);

    expect(sent).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("skips a candidate who already has an active lobby entry", async () => {
    const joiner = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const candidate = await createTestUser({
      rating: 1500,
      gamesPlayed: 20,
      region: "USA East",
      notifyQueueOpportunities: true,
    });
    await subscribeUser(candidate.id, "https://push.example.com/already-queued");
    await prisma.ratingLobbyEntry.create({
      data: {
        userId: candidate.id,
        status: LobbyEntryStatus.WAITING,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const sent = await notifyQueueOpportunitySubscribers(joiner.id, joinerParams(), ["USA East"], null);

    expect(sent).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("skips a candidate outside the candidate's own rating-gap tolerance", async () => {
    const joiner = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const candidate = await createTestUser({
      rating: 1650,
      gamesPlayed: 20,
      region: "USA East",
      maxRatingGap: 50,
      notifyQueueOpportunities: true,
    });
    await subscribeUser(candidate.id, "https://push.example.com/too-far-candidate-side");

    // joinerEffectiveGap is unlimited (null); the candidate's own 50-point
    // tolerance is what should reject a 150-point difference.
    const sent = await notifyQueueOpportunitySubscribers(joiner.id, joinerParams(), ["USA East"], null);

    expect(sent).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("skips a candidate outside the joiner's own rating-gap tolerance", async () => {
    const joiner = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const candidate = await createTestUser({
      rating: 1650,
      gamesPlayed: 20,
      region: "USA East",
      notifyQueueOpportunities: true,
    });
    await subscribeUser(candidate.id, "https://push.example.com/too-far-joiner-side");

    // Candidate's own tolerance is unlimited; the joiner's passed-in 50-point
    // effective gap is what should reject a 150-point difference.
    const sent = await notifyQueueOpportunitySubscribers(joiner.id, joinerParams(), ["USA East"], 50);

    expect(sent).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("skips a candidate whose region is outside the joiner's reach", async () => {
    const joiner = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const candidate = await createTestUser({
      rating: 1500,
      gamesPlayed: 20,
      region: "Japan",
      notifyQueueOpportunities: true,
    });
    await subscribeUser(candidate.id, "https://push.example.com/out-of-reach");

    const sent = await notifyQueueOpportunitySubscribers(joiner.id, joinerParams(), ["USA East"], null);

    expect(sent).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("respects the per-candidate cooldown", async () => {
    const joiner = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const candidate = await createTestUser({
      rating: 1500,
      gamesPlayed: 20,
      region: "USA East",
      notifyQueueOpportunities: true,
      queueOpportunityNotifiedAt: new Date(),
    });
    await subscribeUser(candidate.id, "https://push.example.com/cooldown");

    const sent = await notifyQueueOpportunitySubscribers(joiner.id, joinerParams(), ["USA East"], null);

    expect(sent).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("skips a candidate who has blocked (or is blocked by) the joiner", async () => {
    const joiner = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const candidate = await createTestUser({
      rating: 1500,
      gamesPlayed: 20,
      region: "USA East",
      notifyQueueOpportunities: true,
    });
    await subscribeUser(candidate.id, "https://push.example.com/blocked");
    await blockUser(joiner.id, candidate.id);

    const sent = await notifyQueueOpportunitySubscribers(joiner.id, joinerParams(), ["USA East"], null);

    expect(sent).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});

describe("notifyMatchFoundToUsers — VAPID not configured", () => {
  it("no-ops entirely instead of throwing or sending", async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    const fresh = await import("@/lib/push-server");

    const a = await createTestUser();
    const b = await createTestUser();
    await subscribeUser(a.id, "https://push.example.com/unconfigured");

    await expect(fresh.notifyMatchFoundToUsers(a.id, b.id)).resolves.toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("sendTestPushToUser reports the missing setup as an error", async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    const fresh = await import("@/lib/push-server");

    const user = await createTestUser();
    await subscribeUser(user.id, "https://push.example.com/unconfigured-test");

    const result = await fresh.sendTestPushToUser(user.id);
    expect(result.sent).toBe(0);
    expect(result.error).toMatch(/set up/i);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});
