import { describe, it, expect, vi, afterEach } from "vitest";
import { buildStartggAuthorizeUrl, startggProfileUrl } from "@/lib/startgg-oauth";

describe("startggProfileUrl", () => {
  it("builds a profile URL from a slug", () => {
    expect(startggProfileUrl("user/abc123")).toBe("https://start.gg/user/abc123");
  });
});

describe("buildStartggAuthorizeUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("includes the client id, redirect uri, scope, and state", () => {
    vi.stubEnv("STARTGG_OAUTH_CLIENT_ID", "test-client-id");
    vi.stubEnv("STARTGG_OAUTH_CLIENT_SECRET", "test-client-secret");

    const url = new URL(buildStartggAuthorizeUrl("https://example.com/callback", "abc-state"));
    expect(url.origin + url.pathname).toBe("https://start.gg/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/callback");
    expect(url.searchParams.get("scope")).toBe("user.identity");
    expect(url.searchParams.get("state")).toBe("abc-state");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("throws when OAuth credentials aren't configured", () => {
    vi.stubEnv("STARTGG_OAUTH_CLIENT_ID", "");
    vi.stubEnv("STARTGG_OAUTH_CLIENT_SECRET", "");
    expect(() => buildStartggAuthorizeUrl("https://example.com/callback", "state")).toThrow(
      /isn't configured/i,
    );
  });
});
