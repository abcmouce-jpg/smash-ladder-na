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
