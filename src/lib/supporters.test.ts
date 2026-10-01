import { describe, it, expect } from "vitest";
import { isEffectiveSupporter } from "./supporters";

describe("isEffectiveSupporter", () => {
  it("is false when isSupporter is false, regardless of expiry", () => {
    expect(isEffectiveSupporter({ isSupporter: false, supporterExpiresAt: null })).toBe(false);
    expect(
      isEffectiveSupporter({ isSupporter: false, supporterExpiresAt: new Date(Date.now() + 100000) }),
    ).toBe(false);
  });

  it("is true when isSupporter is true and there's no expiry (admin-granted)", () => {
    expect(isEffectiveSupporter({ isSupporter: true, supporterExpiresAt: null })).toBe(true);
  });

  it("is true when isSupporter is true and the expiry is in the future", () => {
    expect(
      isEffectiveSupporter({ isSupporter: true, supporterExpiresAt: new Date(Date.now() + 100000) }),
    ).toBe(true);
  });

  it("is false when isSupporter is true but the expiry has passed", () => {
    expect(
      isEffectiveSupporter({ isSupporter: true, supporterExpiresAt: new Date(Date.now() - 100000) }),
    ).toBe(false);
  });
});
