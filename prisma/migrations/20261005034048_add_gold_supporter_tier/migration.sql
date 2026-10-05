/*
  Warnings:

  - You are about to drop the `QueueOpportunityNotification` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "QueueOpportunityNotification" DROP CONSTRAINT "QueueOpportunityNotification_convertedMatchId_fkey";

-- DropForeignKey
ALTER TABLE "QueueOpportunityNotification" DROP CONSTRAINT "QueueOpportunityNotification_joinerId_fkey";

-- DropForeignKey
ALTER TABLE "QueueOpportunityNotification" DROP CONSTRAINT "QueueOpportunityNotification_recipientId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isGoldSupporter" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "QueueOpportunityNotification";
