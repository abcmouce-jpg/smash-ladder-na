import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { castProposalVote, closeProposal, createProposal, GOLD_VOTE_WEIGHT } from "@/lib/proposals";
import { createTestUser } from "@/test/factories";

describe("createProposal", () => {
  it("creates an open proposal with trimmed title/description", async () => {
    const mod = await createTestUser();
    const proposal = await createProposal(mod.id, "  Shorten the report timeout  ", "  From 3h to 1h.  ");

    expect(proposal.title).toBe("Shorten the report timeout");
    expect(proposal.description).toBe("From 3h to 1h.");
    expect(proposal.status).toBe("OPEN");
    expect(proposal.forWeight).toBe(0);
    expect(proposal.againstWeight).toBe(0);
  });
});

describe("castProposalVote", () => {
  it("records a FOR vote at base weight for a non-Gold voter", async () => {
    const mod = await createTestUser();
    const voter = await createTestUser();
    const proposal = await createProposal(mod.id, "Title", "Description");

    await castProposalVote(voter.id, proposal.id, "FOR");

    const updated = await prisma.proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(updated.forWeight).toBe(1);
    expect(updated.againstWeight).toBe(0);
  });

  it("records a vote at GOLD_VOTE_WEIGHT for an effectively-Gold voter", async () => {
    const mod = await createTestUser();
    const goldVoter = await createTestUser({
      isSupporter: true,
      isGoldSupporter: true,
      supporterExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    });
    const proposal = await createProposal(mod.id, "Title", "Description");

    await castProposalVote(goldVoter.id, proposal.id, "AGAINST");

    const updated = await prisma.proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(updated.againstWeight).toBe(GOLD_VOTE_WEIGHT);
  });

  it("uses base weight for a voter whose Gold grace period has lapsed", async () => {
    const mod = await createTestUser();
    const lapsedGold = await createTestUser({
      isSupporter: true,
      isGoldSupporter: true,
      supporterExpiresAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    });
    const proposal = await createProposal(mod.id, "Title", "Description");

    await castProposalVote(lapsedGold.id, proposal.id, "FOR");

    const updated = await prisma.proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(updated.forWeight).toBe(1);
  });

  it("toggles the vote off when casting the same choice again", async () => {
    const mod = await createTestUser();
    const voter = await createTestUser();
    const proposal = await createProposal(mod.id, "Title", "Description");

    await castProposalVote(voter.id, proposal.id, "FOR");
    await castProposalVote(voter.id, proposal.id, "FOR");

    const updated = await prisma.proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(updated.forWeight).toBe(0);
    const vote = await prisma.proposalVote.findUnique({ where: { proposalId_userId: { proposalId: proposal.id, userId: voter.id } } });
    expect(vote).toBeNull();
  });

  it("flips the vote when casting the opposite choice", async () => {
    const mod = await createTestUser();
    const voter = await createTestUser();
    const proposal = await createProposal(mod.id, "Title", "Description");

    await castProposalVote(voter.id, proposal.id, "FOR");
    await castProposalVote(voter.id, proposal.id, "AGAINST");

    const updated = await prisma.proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(updated.forWeight).toBe(0);
    expect(updated.againstWeight).toBe(1);
  });

  it("rejects a vote on a closed proposal", async () => {
    const mod = await createTestUser();
    const voter = await createTestUser();
    const proposal = await createProposal(mod.id, "Title", "Description");
    await closeProposal(proposal.id);

    await expect(castProposalVote(voter.id, proposal.id, "FOR")).rejects.toThrow("Voting is closed");
  });
});

describe("closeProposal", () => {
  it("sets status to CLOSED and stamps closedAt", async () => {
    const mod = await createTestUser();
    const proposal = await createProposal(mod.id, "Title", "Description");

    await closeProposal(proposal.id);

    const updated = await prisma.proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(updated.status).toBe("CLOSED");
    expect(updated.closedAt).not.toBeNull();
  });
});
