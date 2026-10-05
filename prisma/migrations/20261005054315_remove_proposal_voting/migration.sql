/*
  Warnings:

  - You are about to drop the `Proposal` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProposalVote` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Proposal" DROP CONSTRAINT "Proposal_createdById_fkey";

-- DropForeignKey
ALTER TABLE "ProposalVote" DROP CONSTRAINT "ProposalVote_proposalId_fkey";

-- DropForeignKey
ALTER TABLE "ProposalVote" DROP CONSTRAINT "ProposalVote_userId_fkey";

-- DropTable
DROP TABLE "Proposal";

-- DropTable
DROP TABLE "ProposalVote";

-- DropEnum
DROP TYPE "ProposalStatus";

-- DropEnum
DROP TYPE "ProposalVoteChoice";
