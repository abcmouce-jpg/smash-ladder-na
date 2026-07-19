-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'DISMISSED', 'ACTIONED');

-- CreateTable
CREATE TABLE "ConductReport" (
    "id" TEXT NOT NULL,
    "matchId" TEXT,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConductReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConductReport_reportedUserId_idx" ON "ConductReport"("reportedUserId");

-- CreateIndex
CREATE INDEX "ConductReport_status_idx" ON "ConductReport"("status");

-- AddForeignKey
ALTER TABLE "ConductReport" ADD CONSTRAINT "ConductReport_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "RatingMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConductReport" ADD CONSTRAINT "ConductReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConductReport" ADD CONSTRAINT "ConductReport_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

