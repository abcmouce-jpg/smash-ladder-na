import { describe, it, expect } from "vitest";
import { secretEquals, hasBearerSecret } from "@/lib/secret-compare";

function bearer(value: string | null) {
  return new Request("https://example.test/", {
    headers: value === null ? {} : { authorization: value },
  });
}

describe("secretEquals", () => {
  it("accepts the right value", () => {
    expect(secretEquals("s3cret", "s3cret")).toBe(true);
  });

  it("rejects a wrong value, a prefix, and a longer guess", () => {
    expect(secretEquals("s3crit", "s3cret")).toBe(false);
    expect(secretEquals("s3cre", "s3cret")).toBe(false);
    expect(secretEquals("s3cret!", "s3cret")).toBe(false);
  });

  it("rejects rather than throwing when either side is missing", () => {
    expect(secretEquals(null, "s3cret")).toBe(false);
    expect(secretEquals("s3cret", null)).toBe(false);
    expect(secretEquals("", "")).toBe(false);
    expect(secretEquals(undefined, undefined)).toBe(false);
  });
});

describe("hasBearerSecret", () => {
  it("accepts the configured secret", () => {
    expect(hasBearerSecret(bearer("Bearer s3cret"), "s3cret")).toBe(true);
  });

  it("is closed when the secret isn't configured", () => {
    // The case that matters most: no env var must never mean "let everyone in".
    expect(hasBearerSecret(bearer("Bearer anything"), undefined)).toBe(false);
    expect(hasBearerSecret(bearer("Bearer anything"), "")).toBe(false);
  });

  it("rejects a missing, malformed, or wrong header", () => {
    expect(hasBearerSecret(bearer(null), "s3cret")).toBe(false);
    expect(hasBearerSecret(bearer("s3cret"), "s3cret")).toBe(false);
    expect(hasBearerSecret(bearer("Basic s3cret"), "s3cret")).toBe(false);
    expect(hasBearerSecret(bearer("Bearer wrong"), "s3cret")).toBe(false);
    expect(hasBearerSecret(bearer("Bearer "), "s3cret")).toBe(false);
  });

  it("tolerates padding around the value", () => {
    expect(hasBearerSecret(bearer("Bearer   s3cret  "), "s3cret")).toBe(true);
  });
});
