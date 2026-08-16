import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  listMatchCommentsAsMod,
  postMatchCommentAsMod,
  listMatchComments,
  postMatchComment,
} from "@/lib/match-comments";
import { createTestUser } from "@/test/factories";

async function createMatch(p1: string, p2: string) {
  return prisma.ratingMatch.create({
    data: { player1Id: p1, player2Id: p2, status: "PENDING_REPORT", expiresAt: new Date() },
  });
}

describe("postMatchCommentAsMod / listMatchCommentsAsMod", () => {
  it("lets a mod (non-participant) post and read a match's comments", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const mod = await createTestUser();
    const match = await createMatch(p1.id, p2.id);

    await postMatchCommentAsMod(mod.id, match.id, "please behave");

    const comments = await listMatchCommentsAsMod(match.id);
    expect(comments).toHaveLength(1);
    expect(comments[0].authorId).toBe(mod.id);
    expect(comments[0].body).toContain("please behave");
  });
});

vi.mock("@/lib/translate", () => ({
  translateText: vi.fn(),
}));

describe("listMatchComments translation", () => {
  afterEach(() => {
    // clearAllMocks (not just restoreAllMocks) — translateText is a bare
    // vi.fn() from the mock factory, not a vi.spyOn wrapper around a real
    // implementation, so restoreAllMocks alone leaves its call history
    // (mock.calls) accumulating across tests in this file.
    vi.clearAllMocks();
  });

  it("never translates the viewer's own messages", async () => {
    const viewer = await createTestUser({ preferredLanguage: "es" });
    const opponent = await createTestUser();
    const match = await createMatch(viewer.id, opponent.id);
    await postMatchComment(viewer.id, match.id, "hola");

    const comments = await listMatchComments(viewer.id, match.id);

    expect(comments[0].translatedBody).toBeNull();
  });

  it("translates an opponent's message into the viewer's preferred language, regardless of the opponent's own site language setting", async () => {
    const { translateText } = await import("@/lib/translate");
    vi.mocked(translateText).mockResolvedValue("hello");

    // Real-world case: both players left their site language on the English
    // default but chatted in Spanish — translation must key off what the
    // viewer wants to read, not either player's preferredLanguage.
    const viewer = await createTestUser({ preferredLanguage: "en" });
    const opponent = await createTestUser({ preferredLanguage: "en" });
    const match = await createMatch(viewer.id, opponent.id);
    await postMatchComment(opponent.id, match.id, "hola");

    const comments = await listMatchComments(viewer.id, match.id);

    expect(translateText).toHaveBeenCalledWith("hola", "en");
    expect(comments[0].translatedBody).toBe("hello");
  });

  it("caches a translation instead of calling translateText again on a later read", async () => {
    const { translateText } = await import("@/lib/translate");
    vi.mocked(translateText).mockResolvedValue("hola");

    const viewer = await createTestUser({ preferredLanguage: "es" });
    const opponent = await createTestUser();
    const match = await createMatch(viewer.id, opponent.id);
    await postMatchComment(opponent.id, match.id, "hello");

    await listMatchComments(viewer.id, match.id);
    const secondRead = await listMatchComments(viewer.id, match.id);

    expect(translateText).toHaveBeenCalledTimes(1);
    expect(secondRead[0].translatedBody).toBe("hola");
  });

  it("falls back to the original text when translation fails", async () => {
    const { translateText } = await import("@/lib/translate");
    vi.mocked(translateText).mockRejectedValue(new Error("gateway down"));

    const viewer = await createTestUser({ preferredLanguage: "es" });
    const opponent = await createTestUser();
    const match = await createMatch(viewer.id, opponent.id);
    await postMatchComment(opponent.id, match.id, "hello");

    const comments = await listMatchComments(viewer.id, match.id);

    expect(comments[0].translatedBody).toBeNull();
    expect(comments[0].body).toBe("hello");
  });
});
