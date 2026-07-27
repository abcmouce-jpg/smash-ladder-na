import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { connectStartggAccount, disconnectStartggAccount } from "@/lib/startgg-oauth";
import { createTestUser } from "@/test/factories";

function mockStartggResponses(identity: { id: string; slug: string; gamerTag: string | null }) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("/oauth/access_token")) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: "test-token" }), { status: 200 }));
    }
    if (url.includes("/gql/alpha")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              currentUser: {
                id: identity.id,
                slug: identity.slug,
                player: identity.gamerTag ? { gamerTag: identity.gamerTag } : null,
              },
            },
          }),
          { status: 200 },
        ),
      );
    }
    throw new Error(`Unexpected fetch to ${url}`);
  });
}

describe("connectStartggAccount / disconnectStartggAccount", () => {
  beforeEach(() => {
    vi.stubEnv("STARTGG_OAUTH_CLIENT_ID", "test-client-id");
    vi.stubEnv("STARTGG_OAUTH_CLIENT_SECRET", "test-client-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("stores the verified identity on the user", async () => {
    const user = await createTestUser();
    vi.stubGlobal(
      "fetch",
      mockStartggResponses({ id: "sgg-1", slug: "user/abc123", gamerTag: "PlayerTag" }),
    );

    await connectStartggAccount(user.id, "auth-code", "https://example.com/callback");

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.startggUserId).toBe("sgg-1");
    expect(updated.startggSlug).toBe("user/abc123");
    expect(updated.startggGamerTag).toBe("PlayerTag");
    expect(updated.startggConnectedAt).not.toBeNull();
  });

  it("rejects connecting a start.gg account already linked to someone else", async () => {
    const existingOwner = await createTestUser({ startggUserId: "sgg-shared" });
    const requester = await createTestUser();
    vi.stubGlobal(
      "fetch",
      mockStartggResponses({ id: "sgg-shared", slug: "user/shared", gamerTag: null }),
    );

    await expect(
      connectStartggAccount(requester.id, "auth-code", "https://example.com/callback"),
    ).rejects.toThrow(/already linked to a different ladder account/i);

    const requesterAfter = await prisma.user.findUniqueOrThrow({ where: { id: requester.id } });
    expect(requesterAfter.startggUserId).toBeNull();
    const ownerAfter = await prisma.user.findUniqueOrThrow({ where: { id: existingOwner.id } });
    expect(ownerAfter.startggUserId).toBe("sgg-shared");
  });

  it("allows reconnecting the same start.gg account to the same user", async () => {
    const user = await createTestUser({ startggUserId: "sgg-1", startggSlug: "user/abc123" });
    vi.stubGlobal(
      "fetch",
      mockStartggResponses({ id: "sgg-1", slug: "user/abc123", gamerTag: "PlayerTag" }),
    );

    await expect(
      connectStartggAccount(user.id, "auth-code", "https://example.com/callback"),
    ).resolves.not.toThrow();
  });

  it("throws a friendly error when start.gg rejects the code", async () => {
    const user = await createTestUser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 400 })),
    );

    await expect(
      connectStartggAccount(user.id, "bad-code", "https://example.com/callback"),
    ).rejects.toThrow(/rejected the authorization code/i);
  });

  it("clears a connected account", async () => {
    const user = await createTestUser({
      startggUserId: "sgg-1",
      startggSlug: "user/abc123",
      startggGamerTag: "PlayerTag",
      startggConnectedAt: new Date(),
    });

    await disconnectStartggAccount(user.id);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.startggUserId).toBeNull();
    expect(updated.startggSlug).toBeNull();
    expect(updated.startggGamerTag).toBeNull();
    expect(updated.startggConnectedAt).toBeNull();
  });
});
