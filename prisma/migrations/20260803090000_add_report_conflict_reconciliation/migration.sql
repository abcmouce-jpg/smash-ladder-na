-- AlterTable
ALTER TABLE "MatchGame" ADD COLUMN     "disputeRequestedAt" TIMESTAMP(3),
ADD COLUMN     "reporterConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "secondReporterConfirmedAt" TIMESTAMP(3);
