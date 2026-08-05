import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { connectStartggAccount, disconnectStartggAccount } from "@/lib/startgg-oauth";
import { createTestUser } from "@/test/factories";

function mockStartggResponses(identity: {
  id: string;
  slug: string;
  gamerTag: string | null;
  playerId?: string | null;
}) {
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
                player: identity.gamerTag
                  ? { id: identity.playerId ?? null, gamerTag: identity.gamerTag }
                  : null,
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
      mockStartggResponses({ id: "sgg-1", slug: "user/abc123", gamerTag: "PlayerTag", playerId: "sgg-p1" }),
    );

    await connectStartggAccount(user.id, "auth-code", "https://example.com/callback");

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.startggUserId).toBe("sgg-1");
    expect(updated.startggPlayerId).toBe("sgg-p1");
    expect(updated.startggSlug).toBe("user/abc123");
    expect(updated.startggGamerTag).toBe("PlayerTag");
    expect(updated.startggConnectedAt).not.toBeNull();
  });

  // Regression test: start.gg's GraphQL API actually serializes
  // currentUser.id as a JSON number (confirmed live via a real OAuth
  // connect — start.gg returned `"id": 1897815`, not `"id": "1897815"`),
  // which Prisma rejected outright since startggUserId is a String column.
  // The mock helper above always passes a string id, so this never caught
  // it — this test talks to fetch directly with a raw number to match what
  // start.gg's API actually sends.
  it("handles start.gg returning currentUser.id as a JSON number, not a string", async () => {
    const user = await createTestUser();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/oauth/access_token")) {
          return Promise.resolve(new Response(JSON.stringify({ access_token: "test-token" }), { status: 200 }));
        }
        if (url.includes("/gql/alpha")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: { currentUser: { id: 1897815, slug: "user/realuser", player: { id: 987654, gamerTag: "RealUser" } } },
              }),
              { status: 200 },
            ),
          );
        }
        throw new Error(`Unexpected fetch to ${url}`);
      }),
    );

    await connectStartggAccount(user.id, "auth-code", "https://example.com/callback");

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.startggUserId).toBe("1897815");
    expect(updated.startggPlayerId).toBe("987654");
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
      startggPlayerId: "sgg-p1",
      startggSlug: "user/abc123",
      startggGamerTag: "PlayerTag",
      startggConnectedAt: new Date(),
    });

    await disconnectStartggAccount(user.id);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.startggUserId).toBeNull();
    expect(updated.startggPlayerId).toBeNull();
    expect(updated.startggSlug).toBeNull();
    expect(updated.startggGamerTag).toBeNull();
    expect(updated.startggConnectedAt).toBeNull();
  });
});
