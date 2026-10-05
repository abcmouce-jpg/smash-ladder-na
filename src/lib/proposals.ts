import { prisma } from "@/lib/db";
import { ProposalStatus, ProposalVoteChoice } from "@/generated/prisma/enums";
import { isEffectiveGoldSupporter } from "@/lib/supporters";

export const PROPOSAL_TITLE_MAX_LENGTH = 120;
export const PROPOSAL_DESCRIPTION_MAX_LENGTH = 2000;

// Vote weight for an effectively-Gold voter at the moment they cast a vote
// — snapshotted onto ProposalVote.weight, not re-derived later (see the
// column comment in schema.prisma).
export const GOLD_VOTE_WEIGHT = 3;
const BASE_VOTE_WEIGHT = 1;

export async function listProposals() {
  return prisma.proposal.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }], // OPEN (enum order) before CLOSED, newest first within each
    include: { createdBy: { select: { id: true, username: true } } },
  });
}

export async function getMyVotes(userId: string, proposalIds: string[]) {
  const votes = await prisma.proposalVote.findMany({
    where: { userId, proposalId: { in: proposalIds } },
    select: { proposalId: true, choice: true },
  });
  return new Map(votes.map((v) => [v.proposalId, v.choice]));
}

export async function createProposal(creatorId: string, title: string, description: string) {
  const trimmedTitle = title.trim().slice(0, PROPOSAL_TITLE_MAX_LENGTH);
  const trimmedDescription = description.trim().slice(0, PROPOSAL_DESCRIPTION_MAX_LENGTH);
  if (!trimmedTitle) throw new Error("Title can't be empty");

  return prisma.proposal.create({
    data: { title: trimmedTitle, description: trimmedDescription, createdById: creatorId },
  });
}

export async function closeProposal(proposalId: string) {
  await prisma.proposal.update({ where: { id: proposalId }, data: { status: ProposalStatus.CLOSED, closedAt: new Date() } });
}

// Upsert-style, same toggle convention as voteOnGuide: casting the same
// choice again clears your vote, casting the other choice flips it. Weight
// is recomputed from the vote rows in the same transaction rather than
// incremented/decremented in place, so concurrent votes can't drift the
// cached totals out of sync.
export async function castProposalVote(userId: string, proposalId: string, choice: ProposalVoteChoice) {
  await prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.findUnique({ where: { id: proposalId }, select: { status: true } });
    if (!proposal) throw new Error("Proposal not found");
    if (proposal.status !== ProposalStatus.OPEN) throw new Error("Voting is closed on this proposal");

    const voter = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { isSupporter: true, isGoldSupporter: true, supporterExpiresAt: true },
    });
    const weight = isEffectiveGoldSupporter(voter) ? GOLD_VOTE_WEIGHT : BASE_VOTE_WEIGHT;

    const existing = await tx.proposalVote.findUnique({ where: { proposalId_userId: { proposalId, userId } } });

    if (existing?.choice === choice) {
      await tx.proposalVote.delete({ where: { id: existing.id } });
    } else if (existing) {
      await tx.proposalVote.update({ where: { id: existing.id }, data: { choice, weight } });
    } else {
      await tx.proposalVote.create({ data: { proposalId, userId, choice, weight } });
    }

    const [forSum, againstSum] = await Promise.all([
      tx.proposalVote.aggregate({ where: { proposalId, choice: ProposalVoteChoice.FOR }, _sum: { weight: true } }),
      tx.proposalVote.aggregate({ where: { proposalId, choice: ProposalVoteChoice.AGAINST }, _sum: { weight: true } }),
    ]);
    await tx.proposal.update({
      where: { id: proposalId },
      data: { forWeight: forSum._sum.weight ?? 0, againstWeight: againstSum._sum.weight ?? 0 },
    });
  });
}
