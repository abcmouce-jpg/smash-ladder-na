-- AlterEnum
ALTER TYPE "PairingMethod" ADD VALUE 'REMATCH';

-- AlterTable
ALTER TABLE "RatingMatch" ADD COLUMN     "player1RematchRequestedAt" TIMESTAMP(3),
ADD COLUMN     "player2RematchRequestedAt" TIMESTAMP(3);
