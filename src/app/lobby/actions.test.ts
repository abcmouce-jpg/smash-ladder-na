import { describe, it, expect, vi, beforeEach } from "vitest";

// The language getLang() is pinned to below, so the wording this test asserts
// on doesn't depend on which language the instance running the suite publishes.
const LANG = "en";

// Only the auth/session, cache and DB-touching edges are faked — the subject
// under test is joinLobby's own control flow (it must revalidate the lobby even
// when the pairing step throws).
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/lobby", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lobby")>()),
  joinLobbyAndTryPair: vi.fn(),
}));
vi.mock("@/lib/account", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account")>()),
  requireNotBanned: vi.fn(),
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: vi.fn(),
}));
// Pinned so the wording this test asserts on doesn't depend on which language
// the instance running the suite happens to publish.
vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n")>()),
  getLang: vi.fn(async () => LANG),
}));

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { joinLobbyAndTryPair } from "@/lib/lobby";
import { GENERIC_ERROR } from "@/lib/localized-error";
import { tr } from "@/lib/lang";
import { joinLobby } from "./actions";

function joinForm() {
  const formData = new FormData();
  formData.set("isPracticing", "off");
  return formData;
}

describe("joinLobby", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
  });

  it("revalidates the lobby even when pairing throws after queueing the player", async () => {
    vi.mocked(joinLobbyAndTryPair).mockRejectedValue(new Error("pairing exploded"));

    const state = await joinLobby({ error: null }, joinForm());

    // A plain Error is something that wasn't meant to be read by a player, so
    // the page gets GENERIC_ERROR rather than its message (see errorMessage).
    expect(state.error).toBe(tr(LANG, GENERIC_ERROR));
    // A Server Action that returns without revalidating doesn't re-render the
    // current route at all, so the client would keep the pre-join tree — where
    // shouldPollLobby() is false and /lobby mounts no poller — even though this
    // player is already queued (or paired) server-side.
    expect(revalidatePath).toHaveBeenCalledWith("/lobby");
  });

  it("revalidates and reports no error on a successful join", async () => {
    vi.mocked(joinLobbyAndTryPair).mockResolvedValue(null);

    const state = await joinLobby({ error: null }, joinForm());

    expect(state).toEqual({ error: null });
    expect(revalidatePath).toHaveBeenCalledWith("/lobby");
  });
});
