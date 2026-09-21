-- Reconstructed after the fact: this migration was applied directly to
-- production (an earlier table-based prototype of queue-opportunity
-- notifications) but its migration.sql was never committed to the repo,
-- leaving production's migration history diverged from what's tracked
-- here. The feature actually shipped via a different approach instead
-- (User.notifyQueueOpportunities / User.queueOpportunityNotifiedAt, see
-- 20260909011044_add_queue_opportunity_notifications), so this table is
-- unused by the current schema — this file exists only to make
-- `prisma migrate status` agree with production's real history again.

-- CreateTable
CREATE TABLE "QueueOpportunityNotification" (
    "id" TEXT NOT NULL,
    "joinerId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedMatchId" TEXT,
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "QueueOpportunityNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QueueOpportunityNotification_joinerId_idx" ON "QueueOpportunityNotification"("joinerId");

-- CreateIndex
CREATE INDEX "QueueOpportunityNotification_recipientId_convertedMatchId_s_idx" ON "QueueOpportunityNotification"("recipientId", "convertedMatchId", "sentAt");

-- AddForeignKey
ALTER TABLE "QueueOpportunityNotification" ADD CONSTRAINT "QueueOpportunityNotification_joinerId_fkey" FOREIGN KEY ("joinerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueOpportunityNotification" ADD CONSTRAINT "QueueOpportunityNotification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueOpportunityNotification" ADD CONSTRAINT "QueueOpportunityNotification_convertedMatchId_fkey" FOREIGN KEY ("convertedMatchId") REFERENCES "RatingMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
