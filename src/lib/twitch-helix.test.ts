import { afterEach, describe, expect, it, vi } from "vitest";

// The module reads NODE_ENV / MOCK_LIVE_TWITCH once, at import time, so each
// case stubs the environment and then re-imports it. Client credentials are
// blanked so the non-mock paths fail closed instead of hitting Twitch — which
// is what lets these assertions run without a network call.
async function loadHelix(nodeEnv: string, mock: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("MOCK_LIVE_TWITCH", mock);
  vi.stubEnv("TWITCH_OAUTH_CLIENT_ID", "");
  vi.stubEnv("TWITCH_OAUTH_CLIENT_SECRET", "");
  vi.resetModules();
  return import("@/lib/twitch-helix");
}

describe("MOCK_LIVE_TWITCH", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("treats every channel as live outside production", async () => {
    const { isTwitchLive, getLiveTwitchUsernames } = await loadHelix("development", "1");

    await expect(isTwitchLive("SomeChannel")).resolves.toBe(true);
    await expect(getLiveTwitchUsernames(["SomeChannel"])).resolves.toEqual(new Set(["somechannel"]));
  });

  // The flag is only documented for .env.development, but .env is loaded in
  // every environment — a stray MOCK_LIVE_TWITCH there must not be able to make
  // a deployed site claim offline channels are live.
  it("is ignored in production, so an offline channel is never reported live", async () => {
    const { isTwitchLive, getLiveTwitchUsernames } = await loadHelix("production", "1");

    await expect(isTwitchLive("SomeChannel")).resolves.toBe(false);
    await expect(getLiveTwitchUsernames(["SomeChannel"])).resolves.toEqual(new Set());
  });
});

describe("Twitch Helix lookups", () => {
  // Re-imports the module so its in-process token cache and live-status cache
  // start empty for each case, then exercises the real (non-mock) path with
  // fetch stubbed so nothing actually leaves the test process.
  async function loadRealHelix() {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MOCK_LIVE_TWITCH", "0");
    vi.stubEnv("TWITCH_OAUTH_CLIENT_ID", "client-id");
    vi.stubEnv("TWITCH_OAUTH_CLIENT_SECRET", "client-secret");
    vi.resetModules();
    return import("@/lib/twitch-helix");
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }

  function authHeader(init?: RequestInit) {
    return ((init?.headers ?? {}) as Record<string, string>).Authorization;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetModules();
  });

  it("asks for a full page of streams so more than 20 live channels aren't truncated", async () => {
    const streamsCalls: { url: string; auth: string | undefined }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.includes("/oauth2/token")) return json({ access_token: "token-1", expires_in: 5_000_000 });
        streamsCalls.push({ url, auth: authHeader(init) });
        return json({ data: [{ user_login: "somechannel" }] });
      }),
    );

    const { getLiveTwitchUsernames } = await loadRealHelix();

    await expect(getLiveTwitchUsernames(["SomeChannel"])).resolves.toEqual(new Set(["somechannel"]));
    expect(streamsCalls).toHaveLength(1);
    expect(streamsCalls[0].url).toContain("first=100");
    expect(streamsCalls[0].auth).toBe("Bearer token-1");
  });

  // Twitch only keeps the ~25 most recent app access tokens per client ID, so
  // the one a long-lived process cached can be silently invalidated out from
  // under it (see the queryLiveLogins comment). Failing closed on that blanked
  // out every live stream until the process recycled; instead the next call
  // must re-mint a token and recover on its own.
  it("re-mints the app access token and retries once when Helix rejects it", async () => {
    let minted = 0;
    let rejectedFirstToken = false;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.includes("/oauth2/token")) {
          minted += 1;
          return json({ access_token: `token-${minted}`, expires_in: 5_000_000 });
        }
        if (!rejectedFirstToken && authHeader(init) === "Bearer token-1") {
          rejectedFirstToken = true;
          return json({ error: "Unauthorized" }, 401);
        }
        return json({ data: [{ user_login: "somechannel" }] });
      }),
    );

    const { getLiveTwitchUsernames } = await loadRealHelix();

    await expect(getLiveTwitchUsernames(["SomeChannel"])).resolves.toEqual(new Set(["somechannel"]));
    expect(minted).toBe(2);
  });

  it("doesn't re-ask Twitch about a channel it just checked", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    let streamsCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = input.toString();
        if (url.includes("/oauth2/token")) return json({ access_token: "token-1", expires_in: 5_000_000 });
        streamsCalls += 1;
        return json({ data: [{ user_login: "somechannel" }] });
      }),
    );

    const { getLiveTwitchUsernames } = await loadRealHelix();

    await getLiveTwitchUsernames(["SomeChannel"]);
    await getLiveTwitchUsernames(["SomeChannel"]);
    expect(streamsCalls).toBe(1);

    // Once the TTL lapses, it checks again.
    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    await getLiveTwitchUsernames(["SomeChannel"]);
    expect(streamsCalls).toBe(2);
  });

  it("fails closed on an API error without caching it, so the next call retries", async () => {
    let streamsCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = input.toString();
        if (url.includes("/oauth2/token")) return json({ access_token: "token-1", expires_in: 5_000_000 });
        streamsCalls += 1;
        if (streamsCalls === 1) return json({ error: "server error" }, 500);
        return json({ data: [{ user_login: "somechannel" }] });
      }),
    );

    const { getLiveTwitchUsernames } = await loadRealHelix();

    await expect(getLiveTwitchUsernames(["SomeChannel"])).resolves.toEqual(new Set());
    await expect(getLiveTwitchUsernames(["SomeChannel"])).resolves.toEqual(new Set(["somechannel"]));
    expect(streamsCalls).toBe(2);
  });

  it("fails closed instead of throwing when the token endpoint is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const { isTwitchLive, getLiveTwitchUsernames } = await loadRealHelix();

    await expect(getLiveTwitchUsernames(["SomeChannel"])).resolves.toEqual(new Set());
    await expect(isTwitchLive("SomeChannel")).resolves.toBe(false);
  });
});
