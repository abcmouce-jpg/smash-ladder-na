import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/generated/prisma/enums", () => ({ UserStatus: {} }));

import {
  isWiredClaimUntrustworthy,
  WIRED_TRUST_MIN_CANCELS,
  WIRED_TRUST_MAX_CANCEL_RATIO,
} from "./account";

describe("isWiredClaimUntrustworthy", () => {
  it("trusts players below the minimum cancel count", () => {
    expect(isWiredClaimUntrustworthy(0, 0)).toBe(false);
    expect(isWiredClaimUntrustworthy(2, 0)).toBe(false);
    expect(isWiredClaimUntrustworthy(WIRED_TRUST_MIN_CANCELS - 1, 0)).toBe(false);
  });

  it("flags players at the min cancel count with a high ratio", () => {
    // 3 cancels, 0 games -> ratio 3/(3+0) = 1.0 > 0.25
    expect(isWiredClaimUntrustworthy(3, 0)).toBe(true);
  });

  it("trusts players at the min cancel count with enough games", () => {
    // 3 cancels, 20 games -> ratio 3/23 ≈ 0.13 <= 0.25
    expect(isWiredClaimUntrustworthy(3, 20)).toBe(false);
  });

  it("flags exactly at the boundary ratio", () => {
    // ratio = cancels / (cancels + games) > 0.25
    // At boundary: 3 / (3 + 9) = 0.25 — NOT greater, so trusted
    expect(isWiredClaimUntrustworthy(3, 9)).toBe(false);
    // 3 / (3 + 8) ≈ 0.273 > 0.25 — flagged
    expect(isWiredClaimUntrustworthy(3, 8)).toBe(true);
  });

  it("trusts long-time players with a handful of cancels", () => {
    expect(isWiredClaimUntrustworthy(5, 200)).toBe(false);
  });

  it("flags serial cancellers even with many games", () => {
    // 30 cancels, 50 games -> ratio 30/80 = 0.375 > 0.25
    expect(isWiredClaimUntrustworthy(30, 50)).toBe(true);
  });
});

describe("trust constants", () => {
  it("min cancels is 3", () => {
    expect(WIRED_TRUST_MIN_CANCELS).toBe(3);
  });

  it("max cancel ratio is 0.25", () => {
    expect(WIRED_TRUST_MAX_CANCEL_RATIO).toBe(0.25);
  });
});
