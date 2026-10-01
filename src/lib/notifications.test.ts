import { describe, it, expect } from "vitest";
import {
  CONFIGURABLE_NOTIFICATION_KEYS,
  NOTIFICATION_DEFS,
  disabledKeysFromEnabled,
  isNotificationEnabled,
} from "@/lib/notifications";

describe("isNotificationEnabled", () => {
  it("is enabled by default", () => {
    expect(isNotificationEnabled({ notificationsDisabled: [] }, "DM_MATCH_FOUND")).toBe(true);
  });

  it("is disabled when the key is in notificationsDisabled", () => {
    expect(isNotificationEnabled({ notificationsDisabled: ["DM_MATCH_FOUND"] }, "DM_MATCH_FOUND")).toBe(false);
  });

  it("always sends critical notifications regardless of the opt-out set", () => {
    const prefs = { notificationsDisabled: CONFIGURABLE_NOTIFICATION_KEYS as unknown as string[] };
    expect(isNotificationEnabled(prefs, "DM_SUSPENSION")).toBe(true);
    expect(isNotificationEnabled(prefs, "DM_CANCEL_WARNING")).toBe(true);
    expect(isNotificationEnabled(prefs, "DM_MOD_MESSAGE")).toBe(true);
  });

  it("reads the opt-in type off notifyQueueOpportunities, not the opt-out set", () => {
    expect(
      isNotificationEnabled({ notificationsDisabled: [], notifyQueueOpportunities: false }, "PUSH_QUEUE_OPPORTUNITY"),
    ).toBe(false);
    expect(
      isNotificationEnabled({ notificationsDisabled: [], notifyQueueOpportunities: true }, "PUSH_QUEUE_OPPORTUNITY"),
    ).toBe(true);
  });
});

describe("disabledKeysFromEnabled", () => {
  it("returns every configurable key that was left unchecked", () => {
    const all = [...CONFIGURABLE_NOTIFICATION_KEYS];
    const kept = all.slice(1);

    const disabled = disabledKeysFromEnabled(kept);

    expect(disabled).toEqual([all[0]]);
  });

  it("collapses an all-checked submission to no disabled keys", () => {
    expect(disabledKeysFromEnabled(CONFIGURABLE_NOTIFICATION_KEYS)).toEqual([]);
  });

  it("drops unknown keys instead of storing them", () => {
    expect(disabledKeysFromEnabled(["NOT_A_REAL_KEY"])).toEqual([...CONFIGURABLE_NOTIFICATION_KEYS]);
  });
});

describe("notification registry", () => {
  it("never lists a critical or opt-in key as configurable", () => {
    for (const def of NOTIFICATION_DEFS) {
      if (def.critical || def.optIn) {
        expect(CONFIGURABLE_NOTIFICATION_KEYS).not.toContain(def.key);
      } else {
        expect(CONFIGURABLE_NOTIFICATION_KEYS).toContain(def.key);
      }
    }
  });
});
