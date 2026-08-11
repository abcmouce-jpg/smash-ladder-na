-- CreateTable
CREATE TABLE "KofiDonation" (
    "id" TEXT NOT NULL,
    "kofiTransactionId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "message" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL,
    "isSubscription" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KofiDonation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KofiDonation_kofiTransactionId_key" ON "KofiDonation"("kofiTransactionId");

-- CreateIndex
CREATE INDEX "KofiDonation_isPublic_createdAt_idx" ON "KofiDonation"("isPublic", "createdAt");
