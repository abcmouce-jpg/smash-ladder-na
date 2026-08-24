import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeToPush, urlBase64ToUint8Array } from "@/lib/push-client";

const TEST_VAPID_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkQZOkFg07VNW-UhE4Bn6pQNQH0yHlDg7X8t_3A";

beforeAll(() => {
  // The conversion reads window.atob; Node has atob but no window.
  (globalThis as Record<string, unknown>).window = globalThis;
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", TEST_VAPID_KEY);
  (globalThis as Record<string, unknown>).PushManager = class PushManager {};
  (globalThis as Record<string, unknown>).Notification = {
    requestPermission: vi.fn().mockResolvedValue("granted"),
  };
  // Node's own `navigator` global has no serviceWorker; replace it with a
  // stub the push-client code can register against.
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { serviceWorker: { register: vi.fn(), getRegistration: vi.fn() } },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url bytes", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
  });

  it("handles padding-less base64url strings", () => {
    expect(Array.from(urlBase64ToUint8Array("AQI"))).toEqual([1, 2]);
  });

  it("decodes a realistic VAPID-key-length string with - and _", () => {
    const bytes = urlBase64ToUint8Array(TEST_VAPID_KEY);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(50);
  });
});

describe("subscribeToPush", () => {
  function makeRegistration() {
    const pushManager = { subscribe: vi.fn(), getSubscription: vi.fn() };
    const registration = { pushManager } as unknown as ServiceWorkerRegistration;
    return { registration, pushManager };
  }

  function stubNavigator(register: ReturnType<typeof vi.fn>, getRegistration: ReturnType<typeof vi.fn>) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { serviceWorker: { register, getRegistration } },
    });
  }

  function expectError(result: { subscription: PushSubscription } | { error: string }, match: RegExp) {
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toMatch(match);
  }

  it("subscribes with the VAPID key and returns the subscription", async () => {
    const { registration, pushManager } = makeRegistration();
    const sub = {} as PushSubscription;
    pushManager.subscribe.mockResolvedValue(sub);
    const register = vi.fn().mockResolvedValue(registration);
    stubNavigator(register, vi.fn().mockResolvedValue(registration));

    const result = await subscribeToPush();

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.subscription).toBe(sub);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(TEST_VAPID_KEY),
    });
  });

  it("drops a stale subscription and retries when the VAPID key changed", async () => {
    const { registration, pushManager } = makeRegistration();
    const stale = { unsubscribe: vi.fn().mockResolvedValue(true) } as unknown as PushSubscription;
    const fresh = {} as PushSubscription;
    pushManager.subscribe
      .mockRejectedValueOnce(new DOMException("already subscribed with a different key", "InvalidStateError"))
      .mockResolvedValueOnce(fresh);
    pushManager.getSubscription.mockResolvedValue(stale);
    stubNavigator(vi.fn().mockResolvedValue(registration), vi.fn().mockResolvedValue(registration));

    const result = await subscribeToPush();

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.subscription).toBe(fresh);
    expect(stale.unsubscribe).toHaveBeenCalledTimes(1);
    expect(pushManager.subscribe).toHaveBeenCalledTimes(2);
  });

  it("retries when the stale subscription is already gone", async () => {
    const { registration, pushManager } = makeRegistration();
    const fresh = {} as PushSubscription;
    pushManager.subscribe
      .mockRejectedValueOnce(new DOMException("already subscribed", "InvalidStateError"))
      .mockResolvedValueOnce(fresh);
    pushManager.getSubscription.mockResolvedValue(null);
    stubNavigator(vi.fn().mockResolvedValue(registration), vi.fn().mockResolvedValue(registration));

    const result = await subscribeToPush();

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.subscription).toBe(fresh);
    expect(pushManager.subscribe).toHaveBeenCalledTimes(2);
  });

  it("explains when the retry after a stale subscription fails", async () => {
    const { registration, pushManager } = makeRegistration();
    pushManager.subscribe
      .mockRejectedValueOnce(new DOMException("already subscribed", "InvalidStateError"))
      .mockRejectedValueOnce(new DOMException("Registration failed - push service not available", "AbortError"));
    pushManager.getSubscription.mockResolvedValue(null);
    stubNavigator(vi.fn().mockResolvedValue(registration), vi.fn().mockResolvedValue(registration));

    const result = await subscribeToPush();

    expectError(result, /push service/);
  });

  it("explains when permission is revoked at subscribe time", async () => {
    const { registration, pushManager } = makeRegistration();
    pushManager.subscribe.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    stubNavigator(vi.fn().mockResolvedValue(registration), vi.fn().mockResolvedValue(registration));

    const result = await subscribeToPush();

    expectError(result, /permission is blocked/);
  });

  it.each(["AbortError", "NotSupportedError"])("explains when the push service is unreachable (%s)", async (name) => {
    const { registration, pushManager } = makeRegistration();
    pushManager.subscribe.mockRejectedValue(new DOMException("Registration failed - push service not available", name));
    stubNavigator(vi.fn().mockResolvedValue(registration), vi.fn().mockResolvedValue(registration));

    const result = await subscribeToPush();

    expectError(result, /push service/);
  });

  it("keeps a generic message for unknown failures but logs the details", async () => {
    const { registration, pushManager } = makeRegistration();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    pushManager.subscribe.mockRejectedValue(new Error("boom"));
    stubNavigator(vi.fn().mockResolvedValue(registration), vi.fn().mockResolvedValue(registration));

    const result = await subscribeToPush();

    expectError(result, /Couldn't subscribe this browser/);
    expect(errorSpy).toHaveBeenCalledWith("push subscribe failed:", "Error", "boom");
  });

  it("reports denied notification permission", async () => {
    (globalThis as Record<string, unknown>).Notification = {
      requestPermission: vi.fn().mockResolvedValue("denied"),
    };
    stubNavigator(vi.fn(), vi.fn());

    const result = await subscribeToPush();

    expectError(result, /permission is blocked/);
    expect(
      ((globalThis as Record<string, unknown>).Notification as { requestPermission: ReturnType<typeof vi.fn> })
        .requestPermission,
    ).toHaveBeenCalledTimes(1);
  });

  it("reports when the site's VAPID key isn't configured", async () => {
    vi.unstubAllEnvs();
    stubNavigator(vi.fn(), vi.fn());

    const result = await subscribeToPush();

    expectError(result, /aren't set up/);
  });
});
