-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyQueueOpportunities" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "queueOpportunityNotifiedAt" TIMESTAMP(3);
