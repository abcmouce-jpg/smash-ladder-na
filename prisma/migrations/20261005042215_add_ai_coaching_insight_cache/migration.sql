-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiInsightBody" TEXT,
ADD COLUMN     "aiInsightGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "aiInsightSignature" TEXT;
