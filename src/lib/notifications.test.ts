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
    expect(isNotificationEnabled({ notificationsDisabled: ["DM_DISPUTES"] }, "DM_DISPUTES")).toBe(false);
  });

  it("treats an unknown key as enabled rather than throwing", () => {
    expect(isNotificationEnabled({ notificationsDisabled: ["NOPE"] }, "DM_MATCH_FOUND")).toBe(true);
  });

  it("reads each queue-opportunity opt-in off its own channel field", () => {
    expect(isNotificationEnabled({ notifyQueueOpportunities: false }, "PUSH_QUEUE_OPPORTUNITY")).toBe(false);
    expect(isNotificationEnabled({ notifyQueueOpportunities: true }, "PUSH_QUEUE_OPPORTUNITY")).toBe(true);
    expect(isNotificationEnabled({ notifyQueueOpportunitiesDm: false }, "DM_QUEUE_OPPORTUNITY")).toBe(false);
    expect(isNotificationEnabled({ notifyQueueOpportunitiesDm: true }, "DM_QUEUE_OPPORTUNITY")).toBe(true);
  });
});

describe("disabledKeysFromEnabled", () => {
  it("returns every configurable key that was left unchecked", () => {
    const all = [...CONFIGURABLE_NOTIFICATION_KEYS];

    expect(disabledKeysFromEnabled(all.slice(1))).toEqual([all[0]]);
  });

  it("collapses an all-checked submission to no disabled keys", () => {
    expect(disabledKeysFromEnabled(CONFIGURABLE_NOTIFICATION_KEYS)).toEqual([]);
  });

  it("drops unknown keys instead of storing them", () => {
    expect(disabledKeysFromEnabled(["NOT_A_REAL_KEY"])).toEqual([...CONFIGURABLE_NOTIFICATION_KEYS]);
  });

  it("keeps opt-in settings out of the opt-out set", () => {
    expect(CONFIGURABLE_NOTIFICATION_KEYS).not.toContain("PUSH_QUEUE_OPPORTUNITY");
    expect(CONFIGURABLE_NOTIFICATION_KEYS).not.toContain("DM_QUEUE_OPPORTUNITY");
  });
});

describe("notification registry", () => {
  it("groups push and Discord settings separately", () => {
    const push = NOTIFICATION_DEFS.filter((def) => def.channel === "push").map((def) => def.key);
    const discord = NOTIFICATION_DEFS.filter((def) => def.channel === "discord").map((def) => def.key);

    expect(push).toEqual(["PUSH_MATCH_FOUND", "PUSH_QUEUE_OPPORTUNITY"]);
    expect(discord).toEqual([
      "DM_MATCH_FOUND",
      "DM_QUEUE_OPPORTUNITY",
      "DM_CHARACTER_GUIDE",
      "DM_MOD_MESSAGES",
      "DM_SUSPENSION",
      "DM_CANCELLATION_WARNING",
      "DM_SEASON_ROLLOVER",
      "DM_MATCH_FORFEIT",
      "DM_MATCH_REPORTS",
      "DM_DISPUTES",
      "DM_FRIENDLIES",
    ]);
  });

  it("has a labelled definition for every key", () => {
    for (const def of NOTIFICATION_DEFS) {
      expect(def.label.en).toBeTruthy();
      expect(def.description.en).toBeTruthy();
    }
  });

  it("only the two queue-opportunity pings are opt-in", () => {
    const optIn = NOTIFICATION_DEFS.filter((def) => def.field).map((def) => def.key);
    expect(optIn).toEqual(["PUSH_QUEUE_OPPORTUNITY", "DM_QUEUE_OPPORTUNITY"]);
  });
});
