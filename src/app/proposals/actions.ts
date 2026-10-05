"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { ProposalVoteChoice } from "@/generated/prisma/enums";
import { castProposalVote, closeProposal, createProposal } from "@/lib/proposals";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return session.user.id;
}

export async function createProposalAction(formData: FormData) {
  const modId = await requireModerator();
  await createProposal(modId, String(formData.get("title") ?? ""), String(formData.get("description") ?? ""));
  revalidatePath("/proposals");
}

export async function closeProposalAction(proposalId: string) {
  await requireModerator();
  await closeProposal(proposalId);
  revalidatePath("/proposals");
}

export async function voteOnProposalAction(proposalId: string, choice: "FOR" | "AGAINST") {
  const userId = await requireUserId();
  await castProposalVote(userId, proposalId, ProposalVoteChoice[choice]);
  revalidatePath("/proposals");
}
